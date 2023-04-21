import React, {
    createContext,
    useState
} from 'react'
import { useNavigate } from "react-router-dom"
import jwt_decode from "jwt-decode";
import axios from "axios"

import useEffectOnce from "../components/useEffectOnce"
import { proxy } from "../actions/config"
import {useInterval} from "../hooks/useInterval"

// ** Defaults
const defaultProvider = {
    user: { isAuth: false },
    loading: true,
    setUser: () => null,
    setLoading: () => Boolean,
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    setHandleCheckAndUpdateAuthHeader: () => null,
    handleCheckAndUpdateAuthHeader:null
}
const AuthContext = createContext(defaultProvider)

const AuthProvider = ({ children, ...props }) => {

    // ** States
    const [logRemember, setRemember] = useState(false)
    const [user, setUser] = useState(defaultProvider.user)
    const [loading, setLoading] = useState(defaultProvider.loading)
    const [counter, setCounter] = useState(0)
    const [delayCheckAndUpdateAuthHeader, setDelayCheckAndUpdateAuthHeader] = useState(null);
    const [authData, setAuthData] = useState(null);

    const navigate = useNavigate();

    useInterval(async () => {

        if(counter<1200){
            
            setCounter(counter+1)   

        }else{
            
            if(authData){
                await RefreshToken(authData)
            }

            setCounter(0)

        }

    }, delayCheckAndUpdateAuthHeader);

    useEffectOnce(() => {
        console.log(window)
        window.electronAPI.ipcRenderer.send("getUserInfo")
        window.electronAPI.ipcRenderer.on('userinfo', (e, result) => {
            if (result) {
                try {
                    const { rememberMe } = result;
                    setRemember(rememberMe)
                    if (rememberMe) {
                        autoAuth(result, "/")
                    }
                } catch {

                }
            }
        })
        
        window.electronAPI.ipcRenderer.on('subWindowAutoLogin', (e, result) => {
            const { rememberMe } = result;
            setRemember(rememberMe)
            autoAuth(result, "/activity")
        })

        window.electronAPI.ipcRenderer.on('LogoutMnuClick', async (event, result) => {
            
            setDelayCheckAndUpdateAuthHeader(null)
            setCounter(0) 

            const keytarData = {
                access: "",
                refresh:  "",
                rememberMe: false
            }
            
   
            window.electronAPI.ipcRenderer.send("saveAccessToken", keytarData)
            navigate("/login")
            
        })

        window.electronAPI.ipcRenderer.on('refreshtoken_on_resume', async (event, result) => {
            setDelayCheckAndUpdateAuthHeader(1000)
            setCounter(0)  
            RefreshToken(result)
        })

    }, [])

    const getNewAccessToken = async (refresh) => {

        try {

            const { data } = await axios.post(proxy + "https://panel.staffmonitor.app/api/token/refresh", { token: refresh })

            setRemember((logRemember) => {

                const keytarData = {
                    access: logRemember ? data.access : "",
                    refresh: logRemember ? data.refresh : "",
                    rememberMe: logRemember
                }

                setAuthData({access:data.access,refresh:data.refresh,rememberMe: logRemember})
                window.electronAPI.ipcRenderer.send("saveAccessToken", keytarData)

                return logRemember;
            })

            return data.access

        } catch (error) {
            return null
        }

    }


    const autoAuth = async (result, url) => {
        const { access, refresh } = result;

        setAuthData(result)
        setDelayCheckAndUpdateAuthHeader(1000)

        if (access) { // logged in
            var decoded = jwt_decode(access);
            let currentTime = Math.floor(Date.now() / 1000);
            if (decoded.exp - currentTime > 0) {
                axios.defaults.headers.common['Authorization'] = "Bearer " + access;
                setUser({ isAuth: true })
                navigate(url)
                window.electronAPI.ipcRenderer.send("logged")
            } else {
                let newToken = await getNewAccessToken(refresh)
                if (newToken) {
                    axios.defaults.headers.common['Authorization'] = "Bearer " + newToken;
                    setUser({ isAuth: true })
                    navigate(url)
                }
            }
        } else { // logged out
            setInterval(async () => {
                let newToken = await getNewAccessToken(refresh)
                if (newToken) {
                    axios.defaults.headers.common['Authorization'] = "Bearer " + newToken;
                }
            }, 30 * 60 * 1000)
        }
    }

    const handleLogin = (params, errorCallback) => {
        axios
            .post(proxy + "https://panel.staffmonitor.app/api/token/access", params)
            .then(async response => {

                const { access, refresh } = response.data;
                // save to keytar
                let keytarData = {
                    access,
                    refresh,
                    rememberMe: params.rememberMe
                }

                setRemember(params.rememberMe)
                window.electronAPI.ipcRenderer.send("saveAccessToken", keytarData)
                autoAuth(keytarData, "/")
  
            })
            .catch(err => {
                if (errorCallback) errorCallback(err)
            })
    }

    const RefreshToken = async ({ access, refresh }) => {

        if (!access || !refresh) {
            return;
        }

        const newToken = await getNewAccessToken(refresh)
        access = newToken;
        if (newToken) {
            axios.defaults.headers.common['Authorization'] = "Bearer " + newToken;
        }

    }

    const handleLogout = () => {
        // setUser(null)
        // window.localStorage.removeItem('userData')
        // window.localStorage.removeItem(authConfig.storageTokenKeyName)
        // router.push('/login')
    }

    const values = {
        user,
        loading,
        setUser,
        setLoading,
        login: handleLogin,
        logout: handleLogout
    }
    return <AuthContext.Provider value={values}>{children}</AuthContext.Provider>
}

export {
    AuthContext,
    AuthProvider
}