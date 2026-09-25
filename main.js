const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "디지펫 바이탈 링크 - 전용 에디터",
    backgroundColor: "#1E2124",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'editor.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC 핸들러 1: project_data.js 로컬 파일 직접 저장 (다운로드 창 없이 즉시 저장)
ipcMain.handle('save-project-data', async (event, projectJson) => {
  try {
    const filePath = path.join(__dirname, 'project_data.js');
    const content = `// 디지펫 바이탈 링크 프로젝트 데이터\nwindow.DIGIPET_DEFAULT_DATA = ${projectJson};\n`;
    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true, path: filePath };
  } catch (err) {
    console.error('File save error:', err);
    return { success: false, error: err.message };
  }
});

// IPC 핸들러 2: Netlify 원클릭 배포 실행
ipcMain.handle('deploy-to-netlify', async (event) => {
  return new Promise((resolve) => {
    // 1단계: make_deploy.py 패키징
    exec('python make_deploy.py', { cwd: __dirname }, (err1, stdout1, stderr1) => {
      if (err1) {
        return resolve({ success: false, step: 'packaging', error: stderr1 || err1.message });
      }

      // 2단계: netlify.cmd deploy --prod --dir=dist 실행
      exec('netlify.cmd deploy --prod --dir=dist', { cwd: __dirname }, (err2, stdout2, stderr2) => {
        if (err2) {
          return resolve({ success: false, step: 'deploy', error: stderr2 || err2.message });
        }
        resolve({ success: true, log: stdout2 });
      });
    });
  });
});
