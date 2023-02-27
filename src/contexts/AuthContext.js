import React, {
    createContext,
    useState
} from 'react'
import { useNavigate } from "react-router-dom"
import jwt_decode from "jwt-decode";
import axios from "axios"

import useEffectOnce from "../components/useEffectOnce"
import { proxy } from "../actions/config"

// ** Defaults
const defaultProvider = {
    user: { isAuth: false },
    loading: true,
    setUser: () => null,
    setLoading: () => Boolean,
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
}
const AuthContext = createContext(defaultProvider)

const AuthProvider = ({ children, ...props }) => {

    // ** States
    const [logRemember, setRemember] = useState(false)
    const [user, setUser] = useState(defaultProvider.user)
    const [loading, setLoading] = useState(defaultProvider.loading)

    const navigate = useNavigate();

    useEffectOnce(() => {
        console.log(window)
        window.electronAPI.ipcRenderer.send("getUserInfo")
        window.electronAPI.ipcRenderer.on('userinfo', (result) => {
            if (result) {
                try {
                    const { rememberMe } = result;
                    setRemember(rememberMe)
                    if (rememberMe) {
                        autoAuth(result, "/")
                        checkAndUpdateAuthHeader(result)
                    }
                } catch {

                }
            }
        })
        
        window.electronAPI.ipcRenderer.on('subWindowAutoLogin', (result) => {
            autoAuth(result, "/activity")
        })
    }, [])

    const getNewAccessToken = (refresh) => {
        return new Promise((resolve, reject) => {
            axios
                .post(proxy + "https://panel.staffmonitor.app/api/token/refresh", { token: refresh })
                .then(({ data }) => {
                    let keytarData = {
                        access: data.access,
                        refresh: data.refresh,
                        rememberMe: logRemember
                    }

                    window.electronAPI.ipcRenderer.send("saveAccessToken", keytarData)
                    resolve(data.access)
                }).catch(err => {
                    reject(null)
                })
        })
    }


    const autoAuth = async (result, url) => {
        const { access, refresh } = result;

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
                window.electronAPI.ipcRenderer.send("saveAccessToken", keytarData)
                autoAuth(keytarData, "/")
                checkAndUpdateAuthHeader(response.data)
            })
            .catch(err => {
                if (errorCallback) errorCallback(err)
            })
    }

    const checkAndUpdateAuthHeader = (data) => {
        let { access, refresh } = data;

        setInterval(async () => {
            if (!access || !refresh) 
                return;

            var decoded = jwt_decode(access);
            let currentTime = Math.floor(Date.now() / 1000);

            if (decoded.exp - currentTime < 0) {
                let newToken = await getNewAccessToken(refresh)
                access = newToken;
                if (newToken) {
                    axios.defaults.headers.common['Authorization'] = "Bearer " + newToken;
                }
            }
        }, 1000)
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