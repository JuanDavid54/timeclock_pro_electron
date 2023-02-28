import React,
{ useState } from "react"
import Button from '@mui/material/Button';
import StopIcon from '@mui/icons-material/Stop';
import CloseIcon from '@mui/icons-material/Close';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';

import { formatTime } from "../module";
import UseEffectOnce from "./useEffectOnce";

export default function () {

    const [isWorking, setWorking] = useState(false)
    const [projectName, setProject] = useState("Testing Feature on Linux Mint 18.1")
    const [workedTime, setWorkedTime] = useState(0)

    UseEffectOnce(() => {
        let timer = null;
        window.electronAPI.ipcRenderer.on("fromMainWindow", (e, data) => {
            if (data.working) {
                setWorking(data.working)
                setProject(data.name)
                setWorkedTime(data.startInterval)
                timer && clearInterval(timer);
                timer = setInterval(() => {
                    setWorkedTime(prev => prev + 1)
                }, 1000)
            } else {
                setWorking(false)
                setProject("")
                setWorkedTime(0)
                timer && clearInterval(timer);
            }
        })
        return () => {
            clearInterval(timer)
        }
    }, [])

    function closeWindow() {
        window.electronAPI.ipcRenderer.send("hideActivityWindow")
    }

    function showMainWindow() {
        window.electronAPI.ipcRenderer.send("showMainWindow")
    }

    function handleWorking() {
        window.electronAPI.ipcRenderer.send('sendDataToMainWindow', {
            working: isWorking
        })
    }
    return (
        <div className="activity-bar">
            <div className="left">
                <img className="logo" src="assets/imgs/revert.png" alt="logo here" onClick={showMainWindow} />
                <Button variant="contained" className="icon-button" onClick={handleWorking}>
                    {
                        isWorking ? <StopIcon /> : <PlayArrowIcon />
                    }
                </Button>
                {
                    isWorking && <>
                        <div className="dot"></div>
                        <span className="project">{projectName}</span>
                    </>
                }
            </div>
            <div className="right">
                <span className="time">{formatTime(workedTime)}</span>
                <Button variant="contained" className="icon-button close" onClick={closeWindow}>
                    <CloseIcon />
                </Button>
            </div>
        </div>
    )
}