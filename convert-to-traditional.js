import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as OpenCC from 'opencc-js';

// 初始化簡體到繁體的轉換器
const converter = OpenCC.Converter({ from: 'cn', to: 'tw' });

// 獲取當前文件的目錄
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 需要處理的目錄
const directories = ['./src', './public', '.'];

// 需要處理的文件類型
const fileExtensions = ['.tsx', '.ts', '.js', '.jsx', '.md', '.json', '.html', '.css'];

// 需要排除的目錄
const excludeDirs = ['node_modules', '.git', 'build', 'dist'];

// 遞歸處理目錄
function processDirectory(directory) {
  const files = fs.readdirSync(directory);
  
  files.forEach(file => {
    const fullPath = path.join(directory, file);
    const stat = fs.statSync(fullPath);
    
    // 檢查是否為目錄
    if (stat.isDirectory()) {
      // 排除特定目錄
      if (!excludeDirs.includes(file)) {
        processDirectory(fullPath);
      }
      return;
    }
    
    // 檢查文件擴展名
    const ext = path.extname(file);
    if (fileExtensions.includes(ext)) {
      convertFile(fullPath);
    }
  });
}

// 轉換文件內容
function convertFile(filePath) {
  try {
    console.log(`轉換文件: ${filePath}`);
    
    // 讀取文件內容
    const content = fs.readFileSync(filePath, 'utf8');
    
    // 使用OpenCC將簡體轉換為繁體
    const traditionalContent = converter(content);
    
    // 只有在內容有變化時才寫入文件
    if (content !== traditionalContent) {
      fs.writeFileSync(filePath, traditionalContent, 'utf8');
      console.log(`  - 已轉換`);
    } else {
      console.log(`  - 無需轉換`);
    }
  } catch (error) {
    console.error(`錯誤: 無法處理文件 ${filePath}`, error);
  }
}

// 開始處理
directories.forEach(dir => {
  processDirectory(dir);
});

console.log('轉換完成!'); 