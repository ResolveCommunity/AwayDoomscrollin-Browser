import { readFileSync, readdirSync, statSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { deflateRawSync, crc32 } from "node:zlib";

const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;

function archivePath(platform) {
  return `dist/awaydoomscrollin-${platform}-v${packageVersion}.zip`;
}

function collectFiles(dir) {
  const files = [];
  function walk(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        files.push(full);
      }
    }
  }
  walk(dir);
  return files;
}

export function createZipArchive(sourceDir, targetZipPath) {
  const filePaths = collectFiles(sourceDir);
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const fullPath of filePaths) {
    const relPath = relative(sourceDir, fullPath).replace(/\\/g, "/");
    const nameBuffer = Buffer.from(relPath, "utf8");
    const uncompressedData = readFileSync(fullPath);
    const compressedData = deflateRawSync(uncompressedData);
    const fileCrc = crc32(uncompressedData);

    const dosTime = 0x0000;
    const dosDate = 0x5821; // 2024-01-01

    // Local file header
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    localHeader.writeUInt16LE(8, 8); // compression method (deflate)
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(fileCrc, 14);
    localHeader.writeUInt32LE(compressedData.length, 18);
    localHeader.writeUInt32LE(uncompressedData.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length

    localChunks.push(localHeader, nameBuffer, compressedData);

    // Central directory header
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0x0800, 8); // UTF-8 filename flag
    centralHeader.writeUInt16LE(8, 10); // compression method (deflate)
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(fileCrc, 16);
    centralHeader.writeUInt32LE(compressedData.length, 20);
    centralHeader.writeUInt32LE(uncompressedData.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra field length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal file attributes
    centralHeader.writeUInt32LE(0, 38); // external file attributes
    centralHeader.writeUInt32LE(offset, 42); // relative offset of local header

    centralChunks.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + compressedData.length;
  }

  const centralDirectoryBuffer = Buffer.concat(centralChunks);
  const centralDirSize = centralDirectoryBuffer.length;
  const centralDirOffset = offset;

  // End of central directory record
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // start disk
  eocd.writeUInt16LE(filePaths.length, 8); // records on disk
  eocd.writeUInt16LE(filePaths.length, 10); // total records
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  const finalBuffer = Buffer.concat([...localChunks, centralDirectoryBuffer, eocd]);

  if (existsSync(targetZipPath)) {
    unlinkSync(targetZipPath);
  }
  writeFileSync(targetZipPath, finalBuffer);
  console.log(`Packaged ${filePaths.length} files into ${targetZipPath} (POSIX paths verified)`);
}

// If executed directly
const target = process.argv[2];
if (target === "all" || !target) {
  createZipArchive("dist/firefox", archivePath("firefox"));
  createZipArchive("dist/chrome", archivePath("chrome"));
} else if (target === "firefox") {
  createZipArchive("dist/firefox", archivePath("firefox"));
} else if (target === "chrome") {
  createZipArchive("dist/chrome", archivePath("chrome"));
}
