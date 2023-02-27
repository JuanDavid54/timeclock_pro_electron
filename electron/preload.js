const { contextBridge, ipcRenderer, desktopCapturer } = require('electron')
window.electronAPI = {
    desktopCapturer: desktopCapturer,
    ipcRenderer: {
        ...ipcRenderer,
        on: (channel, listener) => {
            const subscription = (event, ...args) => listener(...args);
            ipcRenderer.on(channel, subscription);

            return () => {
                ipcRenderer.removeListener(channel, subscription);
            }
        },
        off: (channel, listener) => {
            const subscription = (event, ...args) => listener(...args);
            ipcRenderer.off(channel, subscription);

            return () => {
                ipcRenderer.removeListener(channel, subscription);
            }
        },
        once: (channel, listener) => {
            const subscription = (event, ...args) => listener(...args);
            ipcRenderer.once(channel, subscription);
            return () => {
                ipcRenderer.removeListener(channel, subscription);
            }
        }
    },
    os: require('os'),
    fs: require('fs'),
    path: require('path'),
    activeWindow:require('@srini-b/active-win-mod')
};

// contextBridge.exposeInMainWorld("electronAPI", {
//     desktopCapturer: desktopCapturer,
//     ipcRenderer: {
//         ...ipcRenderer,
//         on: (channel, listener) => {
//             const subscription = (event, ...args) => listener(...args);
//             ipcRenderer.on(channel, subscription);

//             return () => {
//                 ipcRenderer.removeListener(channel, subscription);
//             }
//         },
//         off: (channel, listener) => {
//             const subscription = (event, ...args) => listener(...args);
//             ipcRenderer.off(channel, subscription);

//             return () => {
//                 ipcRenderer.removeListener(channel, subscription);
//             }
//         },
//         once: (channel, listener) => {
//             const subscription = (event, ...args) => listener(...args);
//             ipcRenderer.once(channel, subscription);
//             return () => {
//                 ipcRenderer.removeListener(channel, subscription);
//             }
//         }
//     },
//     os: require('os'),
//     fs: require('fs'),
//     activeWindow: () => { return activeWindow }
// });