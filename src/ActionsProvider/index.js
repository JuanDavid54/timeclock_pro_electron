import React, {
    useRef,
    useState,
    useEffect
} from "react"
import axios from "axios"
import { v4 as uuidv4 } from 'uuid';
import { useSelector } from 'react-redux';

import { proxy } from "../actions/config"
import useEffectOnce from "../components/useEffectOnce"
// create screenshot and count the keyboard press and mouse click.
const SaveActions = (props) => {

    const timer = useRef(null);
    const session = useSelector((state) => state.project.curSession);

    const [mouseCnt, setMouseClicked] = useState(0)
    const [keyCnt, setKeyDown] = React.useState(0)
    const [timePassed, setTimePassed] = useState(0)
    const [appInfos, setAppInfos] = useState([]) // name, title, timeUsed
    const [displays, setDisplays] = useState([])

    useEffectOnce(() => {

        window.electronAPI.ipcRenderer.on("displays", (e, data)=>{
            //console.log(data)
            setDisplays(data)
        })

        timer.current = setInterval(() => {
            setTimePassed(prev => prev + 1)
        }, 1000) // create screenshot and save the key&mouse event in every 3 minutes

        return () => {
            timer.current && clearInterval(timer.current);
            timer.current = null;
        }
    }, [])

    useEffect(() => {
        if (
            timePassed !== 0
            && timePassed % 180 === 0
            && session
        ) {             
            createScreenShot();  
            saveAppInfo()        
        }
         else if (session)
            getAppInfo()
    }, [timePassed])

    useEffect(() => {
        // receive mouse click and key press event
        const mouseClickEvent = () => {
            setMouseClicked(prev => prev + 1)
        }
        
        window.electronAPI.ipcRenderer.on("mouseclick", mouseClickEvent)

        const keydownEvent = () => {
            setKeyDown(prev => prev + 1)
        }

        window.electronAPI.ipcRenderer.on("keydown", keydownEvent)

        return () => {
            window.electronAPI.ipcRenderer.off("mouseclick", mouseClickEvent)
            window.electronAPI.ipcRenderer.off("keydown", keydownEvent)
        }
    }, [])

    const getAppInfo = async () => {
        const { activeWindow } = window.electronAPI;
        const info = await activeWindow();
        if ( info && info.title ) {
            let find = null;
            const type = ["Google Chrome", "Vivaldi", "Safari", "Firefox"].indexOf(info.owner.name) === -1 ? "application" : "website";

            if (type === "application")
                find = appInfos.find(item => item.nameDetail === info.title
                    && item.name === info.owner.name
                    && item.sessionId === (session ? session.id : null)
                )
            else
                find = appInfos.find(item => item.nameDetail === info.title
                    && item.sessionId === (session ? session.id : null)
                )

            if (find) {
                setAppInfos([].concat(appInfos.map(item => {
                    if (item.nameDetail === info.title
                        && item.sessionId === (session ? session.id : null)
                        && item.name === info.owner.name
                    )
                        return { ...item, timeUsed: item.timeUsed + 1 }
                    return item;
                })))
            } else {

                let data = {
                    url: info.url,
                    nameDetail: info.title,
                    type,
                    sessionId: session ? session.id : null,
                    timeUsed: 1
                }

                if (type === "application")
                    data = {
                        ...data,
                        name: info.owner.name
                    }
                else
                    data = {
                        ...data,
                        name: ""
                    }

                setAppInfos(appInfos.concat(data))
            }
        }
    
    }

    const saveAppInfo = () => {
        appInfos.forEach(item => {
            axios
            .post(proxy + "https://panel.staffmonitor.app/api/app-log", item)
            setAppInfos([])
        })

    }

    const uploadFile = (fileName, parentid = null) => {

        const data = new FormData();
        const { path, os, fs } = window.electronAPI;
        const filePath = path.join(os.tmpdir(), fileName);

        if (parentid)
            data.append("parent", parentid);

        let mClick = Math.floor(mouseCnt / 3), kClick = Math.floor(keyCnt / 3)
        let file = new File([fs.readFileSync(filePath)],
            fileName,
            { type: "image/jpeg", lastModified: Date.now() }
        );

        data.append("file", file);
        data.append("screencast", 1)
        data.append("name", fileName)
        data.append("clockId", session ? session.id : null)
        data.append(`mouseStat`, mClick >= 50 ? 50 : mClick);
        data.append(`keyboardStat`, kClick >= 50 ? 50 : kClick);

        let config = {
            headers: {
                "Content-Type": "multipart/form-data",
            }
        }
        //console.log(mClick, kClick, mouseCnt, keyCnt)
        setMouseClicked(0)
        setKeyDown(0)

        return axios
            .post(proxy + "https://panel.staffmonitor.app/api/files", data, config)
    }

    const getProfile = async () => {
        try {

            const res = await axios.get(proxy + "https://panel.staffmonitor.app/api/profile")
            return res.data

        } catch (error) {
            console.log(error)
            return { blurScreencasts: 0, takeScreencasts: 0 }
        }
    }

    const createScreenShot = async () => {
        const { 
            os, 
            fs,
            path, 
            desktopCapturer            
        } = window.electronAPI;

        const { blurScreencasts, takeScreencasts } = await getProfile()
        const isBlur = blurScreencasts

        try {
            
            if (!takeScreencasts) {
            
                window.electronAPI.ipcRenderer.send("getFakescreenshot")
                window.electronAPI.ipcRenderer.once("getFakescreenshot", async (event, result) => {

                    const fileNames = []
                    //console.log(result)
                    let fileName = `${uuidv4()}.jpg`;
                    let outputPath = path.join(os.tmpdir(), fileName);

                    //write file 
                    fs.writeFileSync(outputPath, result, 'base64');
                    //add file to array
                    fileNames.push(fileName)

                    //uploadFile
                    try {
                        await uploadFile(fileNames[0])   
                        fileNames.shift();
                    } catch (error) {
                        console.log("fileUpload:", error)    
                    }
                })

            } else {

                // Retrieve information about all connected displays and determine the maximum width and height of all displays.
                //const displays = screen.getAllDisplays();
                const { width: maxWidth, height: maxHeight } = displays.reduce((acc, display) => {
                    
                    const { width, height } = display.workAreaSize;
                    
                    return { 
                        width: Math.max(acc.width, width),
                        height: Math.max(acc.height, height) 
                    };

                }, { width: 0, height: 0 });

                // Get sources for windows and screens, and set the thumbnail size to the maximum width and height determined above.
                desktopCapturer.getSources({
                    types: ['window', 'screen'],
                    thumbnailSize: { width: maxWidth, height: maxHeight }
                }).then(async sources => {

                    const fileNames = [];
                    // Loop through the retrieved sources.
                    for (const source of sources) {

                 
                        if (source.name !== 'Entire Screen' && !source.name.startsWith('Screen ')) continue;
                        
                        const fileName = `${uuidv4()}.jpg`;
                        // Find the display corresponding to the source and set the screen width and height based on the display work area size or the maximum width and height determined above.
                        const display = displays.find(item => item.id === source.display_id);
                        const screenWidth = display ? display.workAreaSize.width : maxWidth;
                        const screenHeight = display ? display.workAreaSize.height : maxHeight;
                        const outputPath = path.join(os.tmpdir(), fileName);

                        try {
                            
                            // Create an Image object and set the source thumbnail as its source, then wait for the image to load.
                            const img = new Image();
                            img.src = source.thumbnail.toDataURL();
                            await new Promise(resolve => { img.onload = resolve; });
                            
                            // Create a canvas element, set its dimensions to the screen width and height, and apply a blur effect (if `isBlur` is true). Then draw the image onto the canvas and convert the resulting image data to a base64-encoded JPEG format.
                            const canvas = document.createElement('canvas');
                            canvas.width = screenWidth;
                            canvas.height = screenHeight;
                            const ctx = canvas.getContext('2d');
                            ctx.filter = isBlur ? 'blur(6px)' : 'blur(0px)'; // apply a 10px blur effect
                            ctx.drawImage(img, 0, 0, screenWidth, screenHeight);
                            const imageDataURL = canvas.toDataURL('image/jpeg', 0.3);

                            // Write the converted image data to a file in the OS temporary directory with the generated file name, and add the file name to an array of file names.
                            fs.writeFileSync(outputPath, imageDataURL.replace(/^data:image\/jpeg;base64,/, ''), 'base64');
                            fileNames.push(fileName);

                        } catch (error) {
                            console.error(error);
                        }

                    }

                    try {
                        
                        //console.log(fileNames)
                        // Upload the first file in the array to a server using the `uploadFile` function and the remaining files in the array to the same server using the ID of the first file.
                        const res = await uploadFile(fileNames[0]);
                        fileNames.slice(1).forEach(item => uploadFile(item, res.data.id));

                    } catch (error) {
                        console.error('fileUpload:', error);
                    }

                });

                /*
                let maxWidth = 0, maxHeight = 0;
                
                displays.forEach(item => {
                    let { width, height } = item.workAreaSize;

                    if (maxWidth < width)
                        maxWidth = width;

                    if (maxHeight < height)
                        maxHeight = height;
                })
                
                //get sources
                const sources = await desktopCapturer.getSources({ types: ['window', 'screen'],thumbnailSize: { width: maxWidth, height: maxHeight } })
                let fileNames = []

                await Promise.all(sources.map((source) => {
                    
                    return new Promise( async (resolve, reject) => {

                        if (source.name !== 'Entire Screen' && !source.name.startsWith("Screen ")) {
                            resolve()
                            return
                        }

                        let fileName = `${uuidv4()}.jpg`;
                        let display = displays.find(item => item.id === source.display_id)
                        let screenWidth = maxWidth, screenHeight = maxHeight;
                        let outputPath = path.join(os.tmpdir(), fileName);

                        if (display) {
                            screenWidth = display.workAreaSize.width;
                            screenHeight = display.workAreaSize.height;
                        }

                        fileNames.push(fileName)

                        try {
                            const img = new Image();

                            img.src = source.thumbnail.toDataURL();
                            img.onload = () => {

                                const canvas = document.createElement('canvas');
                                canvas.width = screenWidth;
                                canvas.height = screenHeight;

                                const ctx = canvas.getContext('2d');
                                ctx.filter = isBlur ? 'blur(6px)' : 'blur(0px)';  // apply a 10px blur effect
                                ctx.drawImage(img, 0, 0, screenWidth, screenHeight);

                                const imageDataURL = canvas.toDataURL('image/jpeg', 0.3);
                                fs.writeFileSync(outputPath, imageDataURL.replace(/^data:image\/jpeg;base64,/, ''), 'base64');
                                resolve()

                            }

                        } catch (error) {
                            console.error(error);
                            reject()
                        }

                    })

                }))

                uploadFile(fileNames[0])
                    .then(res => {
                        fileNames.shift();
                        fileNames.forEach(item => uploadFile(item, res.data.id))
                    }).catch(err => {
                        console.log("fileUpload:", err)
                    })*/

            }

        } catch (err) {
            console.error(err);
        }
    }

    return (
        <>
            {props.children}
        </>
    )
}

export default SaveActions