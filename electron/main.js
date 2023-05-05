const { app, BrowserWindow, shell, ipcMain, Tray, Menu, screen,systemPreferences,dialog,powerMonitor } = require('electron');
const path = require('path');
const url = require('url');
const keytar = require('keytar');
const AutoLaunch = require('auto-launch');
const os = require('os')
const fs = require('fs')
const autoLaunch = new AutoLaunch({
    name: 'StaffMonitor',
    path: app.getPath('exe'),
});

let mainWindow, loadingWindow, activityBar, trayIcon, isLogged = false;
//var iconpath = path.join(__dirname, '../public/assets/TrayTemplate.png') // path of y
// var iconpath = path.join(__dirname, '../assets/TrayTemplate.png') // path of y
var iconpath = (process.env.ELECTRON_START_URL)?path.join(__dirname, '../public/assets/TrayTemplate.png'): path.join(process.resourcesPath, 'public/assets/TrayTemplate.png') // path of y
// var iconpath = "./IconTemplate.ico" // path of y
// Register and start hook
const ioHook = require('iohook');
const { main } = require('@popperjs/core');
ioHook.start();
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

// keytar.deletePassword('app', 'userinfo');
// keytar.deletePassword('app', 'settings');
function createTrayIcon() {
    let appIcon = new Tray(iconpath);
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show App', click: function () {
                mainWindow.show();
            }
        },
        {
            label: 'Exit', click: function () {
                app.isQuiting = true;
                ioHook.stop();
                app.quit();
            }
        }
    ]);
    appIcon.on('double-click', function (event) {
        mainWindow.show();
    });
    appIcon.setContextMenu(contextMenu);
    return appIcon;
}

function createAppMenu() {

    const template = [{
        label: app.name,
        submenu: [
            {
                label: 'Logout',
                click: async () => {

                    if (!isLogged) {
                        return
                    }

                    const choice = await dialog.showMessageBox(
                        mainWindow,
                        {
                            type: 'question',
                            defaultId: 0,
                            cancelId: 1,
                            buttons: ['Yes', 'No'],
                            title: 'staffmonitor',
                            message: 'Log out?'
                        }
                    );

                    if (choice.response === 0) {
                        mainWindow?.webContents.send("LogoutMnuClick")
                        activityBar?.webContents.send('fromMainWindow', { working: false, name: "", startInterval: 0 });
                        activityBar?.hide()
                        isLogged = false
                    }
                }
            },
            {
                label: 'Exit',
                click: async () => {

                    const choice = await dialog.showMessageBox(
                        mainWindow,
                        {
                            type: 'question',
                            defaultId: 0,
                            cancelId: 1,
                            buttons: ['Yes', 'No'],
                            title: 'staffmonitor',
                            message: 'Do you want to exit the application?'
                        }
                    );

                    if (choice.response === 0) {
                        app.isQuiting = true;
                        ioHook.stop();
                        app.quit();
                    }

                }
            }
        ]
    },
    {
        role: 'help',
        submenu: [
          {
            label: 'Learn More',
            click: async () => {
              shell.openExternal('https://staffmonitor.app')
            }
          }
        ]
    }
    ]

    const menu = Menu.buildFromTemplate(template)
    Menu.setApplicationMenu(menu)

}

function createActivityBar() {

    const screenWidth = screen.getPrimaryDisplay().workAreaSize.width;
    const screenHeight = screen.getPrimaryDisplay().workAreaSize.height;

    activityBar = new BrowserWindow({
        show: false,
        width: 700,
        height: 30,
        frame: false,// remove the window frame
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: false, // isolate renderer process from main process
            // devTools: false
        },
        resizable: false,
        icon: iconpath,
        minimizable: false,
        hasShadow: false, // remove the window shadow
        transparent: true,
        maximizable: false,
        useContentSize: true
    }); // 

    activityBar.setAlwaysOnTop(true, 'floating',1)
    activityBar.setPosition(screenWidth / 2 - 350, screenHeight - 30)

   //force the height of the window to 30px.
    activityBar.setShape([
        {
            x: 0,
            y: 0,
            width: 700,
            height: 30
        }
    ]);

    activityBar.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && (input.key === 'R' && input.control || input.key === 'r' && input.control)) {
            event.preventDefault();
        }
    });

    // Set the rounded corners using CSS
    activityBar.webContents.once('dom-ready', () => {
        const secret = keytar.getPassword('app', 'userinfo');
        secret.then((result) => {
            if (result) {
                setTimeout(() => {
                    activityBar.webContents.send('subWindowAutoLogin', JSON.parse(result));
                }, 2000)
            }
        })
    })
    activityBar.webContents.on("new-window", (_, url) => {
        _.preventDefault();
        const protocol = require("url").parse(url).protocol;
        if (protocol === "http:" || protocol === "https:") {
            shell.openExternal(url);
        }
    });
    const activityUrl = process.env.ELECTRON_ACTIVITY_URL || url.format({
        pathname: path.join(__dirname, '../index.html'),
        protocol: 'file:',
        slashes: true
    });
    activityBar.loadURL(activityUrl);
    activityBar.on('closed', function () {
        activityBar = null;
    });

    activityBar.on('show', function (event) {

        try {

            //Remove the background of the body to use the transparent property of the browser window.
            const css = `
            body {
                font-family: 'Montserrat';
                font-style: normal;
                background-color: transparent;
            }
            `
            activityBar?.webContents.executeJavaScript(`
                function disableBackground(){
                    const style = document.createElement('style')
                    style.innerHTML = ${JSON.stringify(css)}
                    document.head.appendChild(style)
                    return true
                }

                disableBackground()
            `)

        } catch (error) {
            console.log("Error",error.message)       
        }


    })

}

function createWindow() {
    
    setInitialAppSettings()

    const width = 1200, height = 800;
    loadingWindow = new BrowserWindow({ show: false, width, height, icon: iconpath })

    loadingWindow.once('show', () => {

        const startUrl = process.env.ELECTRON_START_URL || url.format({
            pathname: path.join(__dirname, '../index.html'),
            protocol: 'file:',
            slashes: true
        });
        
        mainWindow = new BrowserWindow({
            width,
            height,
            show: false,
            webPreferences: {
                preload: path.join(__dirname, "preload.js"),
                contextIsolation: false, // isolate renderer process from main process
            },
            resizable: false,
            icon: iconpath
        });

        mainWindow.webContents.once('dom-ready', async () => {
            // get access token
            mainWindow.show()
            loadingWindow.close()
            mainWindow?.webContents.send("displays", await screen.getAllDisplays())
            //send mouse click and key press event per action triggered.
            ioHook.on('mouseclick', (event) => {
                mainWindow?.webContents.send("mouseclick", event)
            });
            ioHook.on('keydown', event => {
                mainWindow?.webContents.send("keydown", event)
            });
            // create Tray Icon
            trayIcon = createTrayIcon()
        })

        mainWindow.webContents.on("new-window", (_, url) => {
            _.preventDefault();
            const protocol = require("url").parse(url).protocol;
            if (protocol === "http:" || protocol === "https:") {
                shell.openExternal(url);
            }
        });

        mainWindow.loadURL(startUrl);
        mainWindow.on('closed', function () {
            mainWindow = null;
        });

        mainWindow.on('close', async function (event) {
            if (!app.isQuiting) {
                event.preventDefault();
                mainWindow.hide();
                app.dock.hide();
                const { visibility } = await getAppSettings()
                if ((visibility == "true" || visibility === true) && isLogged == true) {
                    activityBar.show()
                } else
                    activityBar.hide()
            }
            return false;
            // mainWindow.hide()
            // if (!trayIcon)
            //     trayIcon = createTrayIcon()
        })

        mainWindow.on('minimize', async function (event) {
            event.preventDefault()
            mainWindow.hide()
            app.dock.hide();
            const { visibility } = await getAppSettings()
            if ((visibility == "true" || visibility === true) && isLogged == true) {
                activityBar.show()
            } else
                activityBar.hide()
        })
        
        mainWindow.on('show', async function (event) {
            app.dock.show();   
        })

        //////////////////////////------ACTIVITY BAR---/////////////////////////////////
        createActivityBar()
        //mainWindow.webContents.openDevTools()
    })

    const loadingUrl = url.format({
        pathname: path.join(__dirname, '../loading.html'),
        protocol: 'file:',
        slashes: true,
    });
    loadingWindow.loadURL(loadingUrl)
    loadingWindow.show()
}
app.on('ready', () => {
    
    //It is detected when the computer comes out of hibernation.
    powerMonitor.on('resume', () => {

        if(!isLogged){
            return
        }

        try {
            setTimeout( async ()=>{

                const secret = JSON.parse(await keytar.getPassword('app', 'userinfo'));
                //If the 'remember' option is enabled, refreshes the token.
                if(secret.refresh){
                
                    mainWindow?.webContents.send("refreshtoken_on_resume",secret)
                
                }else{
        
                    //If the 'remember' option is disabled, returns to the login screen.
                    mainWindow?.webContents.send("LogoutMnuClick")
                    activityBar?.webContents.send('fromMainWindow', { working: false, name: "", startInterval: 0 });
                    activityBar?.hide()
                    isLogged = false

                }  
                
            },2000) 

        } catch (error) {

            console.log(error)   

        }

        
    });

    createAppMenu()
    createWindow()
    

});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        ioHook.stop();
        app.quit();
    }
});
app.on('activate', function () {
    if (mainWindow === null) {
        createWindow();
    }
});
// save accessToken
ipcMain.on("saveAccessToken", (event, data) => {
    activityBar.webContents.send('subWindowAutoLogin', data);
    keytar.setPassword('app', 'userinfo', JSON.stringify(data));
});

ipcMain.on("logged", (event, data) => {
    isLogged = true;
})

ipcMain.on("removeAccessToken", (event, data) => {
    keytar.deletePassword('app', 'userinfo');
});

ipcMain.on("getUserInfo", (event) => {
    const secret = keytar.getPassword('app', 'userinfo');
    secret.then((result) => {
        event.sender.send("userinfo", JSON.parse(result))
    })
});

ipcMain.on("showMainWindow", () => {
    mainWindow.setAlwaysOnTop(true)
    mainWindow.show();
    mainWindow.setAlwaysOnTop(false)
})

// send data to sub window
ipcMain.on('sendDataToSubWindow', (event, data) => {
    
    if(activityBar){
        activityBar.webContents.send('fromMainWindow', data);
    }

})

// send data to sub window 
ipcMain.on('sendDataToSubWindowBreakStatus', (event, data) => {
    activityBar.webContents.send('fromMainWindowBreakStatus', data);
})

// send data to main window
ipcMain.on('sendDataToMainWindow', (event, data) => {
    mainWindow.webContents.send('fromSubWindow', data);
})

// save app settings
ipcMain.on('saveAppSettings', (event, data) => {
    keytar.setPassword('app', 'settings', JSON.stringify(data))
    if (data.startup == true || data.startup == "true") {
        autoLaunch.isEnabled().then((isEnabled) => {
            if (!isEnabled) autoLaunch.enable();
        });
    } else {
        autoLaunch.isEnabled().then((isEnabled) => {
            if (isEnabled)
                autoLaunch.disable();
        });

    }
})

ipcMain.on("getAppSettings", (event) => {
    const secret = keytar.getPassword('app', 'settings');
    secret.then((result) => {
        event.sender.send("appSettings", result)
    })
});

ipcMain.on("showActivityBar", async () => {
    const { visibility } = await getAppSettings()
    if (visibility == "true" || visibility === true)
        activityBar.show()
    else
        activityBar.hide()
    mainWindow.focus()
})

ipcMain.on("hideActivityWindow", async () => {
    activityBar.hide()
})

ipcMain.on("getFakescreenshot", (event, _) => {

    const pathAsset = (process.env.ELECTRON_START_URL) ? path.join(__dirname,'../public/assets/screenshot_disabled.jpg') : path.join(process.resourcesPath, 'public/assets/screenshot_disabled.jpg')
    const img=fs.readFileSync(pathAsset).toString('base64')
    event.sender.send("getFakescreenshot",img)

});

async function setInitialAppSettings() {

    const settings = await getAppSettings()
    if (!settings) {
        keytar.setPassword('app', 'settings', JSON.stringify({ "visibility": true, "startup": false, "isRemind": true, "days": [1, 2, 3, 4, 5], "mins": "15", "time_from": "2014-08-18T00:00:00", "time_to": "2014-08-18T00:15:00" }))
    }

}

function getAppSettings() {
    return new Promise((resolve) => {
        const secret = keytar.getPassword('app', 'settings');
        secret.then((result) => {
            if (result)
                resolve(JSON.parse(result))
            else
                resolve(null)
        }).catch(() => {
            resolve(null)
        })
    })
}



// const userInfo = os.userInfo();
// ipcMain.on("getBrowerHistory", (event, data) => {
//     // Copying the file to a the same name
//     let timeId = setTimeout(async () => {
//         let dbPath = path.resolve(userInfo.homedir, "AppData/Local/Google/Chrome/User Data/Default/History");
//         let tempDb = os.tmpdir() + "/History"
//         await addChromeURL(dbPath, tempDb, data)
//         dbPath = path.resolve(userInfo.homedir, "AppData/Roaming/Mozilla/Firefox/Profiles/default/places.sqlite");
//         tempDb = os.tmpdir() + "/places.sqlite"
//         await addFirefoxURL(dbPath, tempDb, data)
//         event.sender.send("getBrowerHistory", data.filter(item => item.type == "application" || (item.type === "website" && item.name != "")))
//         clearTimeout(timeId)
//     }, 5000)

//     // 
// });

// function addChromeURL(src, dest, data) {
//     return new Promise((resolve) => {
//         try {
//             fs.writeFileSync(dest, fs.readFileSync(src));
//         } catch {
//             return resolve([])
//         }
//         let db = new sqlite3.Database(dest, sqlite3.OPEN_READWRITE, (err) => {
//             if (err) {
//                 console.error(err.message);
//             }
//         });
//         db.all(`SELECT visits.visit_time, urls.title, urls.url FROM visits JOIN urls ON urls.id = visits.url ORDER BY visits.visit_time DESC LIMIT 150`, [], (err, rows) => {
//             if (err) {
//                 throw err;
//             }
//             data.forEach(element => {
//                 let find = rows.find(item => element.nameDetail.indexOf(item.title) !== -1)
//                 if (find) {
//                     element.url = find.url;
//                     let urlData = url.parse(find.url)
//                     element.name = `${urlData.host}`;
//                 }
//             });

//             db.close(() => {
//                 // if (fs.existsSync(dest))
//                 //     fs.unlinkSync(dest)
//                 resolve(data)
//             })
//         });
//     })
// }

// function addFirefoxURL(src, dest, data) {
//     return new Promise((resolve) => {
//         try {
//             fs.writeFileSync(dest, fs.readFileSync(src));
//         } catch {
//             return resolve([])
//         }
//         let db = new sqlite3.Database(dest, sqlite3.OPEN_READWRITE, (err) => {
//             if (err) {
//                 console.error(err.message);
//             }
//         });
//         db.all(`SELECT url, title FROM moz_places ORDER BY last_visit_date DESC LIMIT 150`, [], (err, rows) => {
//             if (err) {
//                 throw err;
//             }
//             data.forEach(element => {
//                 let find = rows.find(item => element.nameDetail.indexOf(item.title) !== -1)
//                 if (find) {
//                     element.url = find.url;
//                     let urlData = url.parse(find.url)
//                     element.name = `${urlData.host}`;
//                 }
//             });

//             db.close(() => {
//                 // if (fs.existsSync(dest))
//                 //     fs.unlinkSync(dest)
//                 resolve(data)
//             })
//         });
//     })
// }   
