import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const clientSrc = path.join(root, 'client-web', 'dist');
const adminSrc = path.join(root, 'admin-web', 'dist');
const clientDest = path.join(root, 'dist', 'client');
const adminDest = path.join(root, 'dist', 'admin');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`源目录不存在: ${src}`);
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  
  function recursiveCopy(srcPath, destPath) {
    const entries = fs.readdirSync(srcPath, { withFileTypes: true });
    for (const entry of entries) {
      const srcEntry = path.join(srcPath, entry.name);
      const destEntry = path.join(destPath, entry.name);
      if (entry.isDirectory()) {
        fs.mkdirSync(destEntry, { recursive: true });
        recursiveCopy(srcEntry, destEntry);
      } else {
        fs.copyFileSync(srcEntry, destEntry);
      }
    }
  }
  
  recursiveCopy(src, dest);
  console.log(`已复制: ${src} -> ${dest}`);
}

try {
  copyDir(clientSrc, clientDest);
  copyDir(adminSrc, adminDest);
  console.log('构建产物合并完成');
} catch (error) {
  console.error('合并失败:', error.message);
  process.exit(1);
}
