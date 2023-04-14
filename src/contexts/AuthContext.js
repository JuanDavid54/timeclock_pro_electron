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
    setHandleCheckAndUpdateAuthHeader: () => null,
    handleCheckAndUpdateAuthHeader:null
}
const AuthContext = createContext(defaultProvider)

const AuthProvider = ({ children, ...props }) => {

    // ** States
    const [logRemember, setRemember] = useState(false)
    const [user, setUser] = useState(defaultProvider.user)
    const [loading, setLoading] = useState(defaultProvider.loading)
    const [handleCheckAndUpdateAuthHeader, setHandleCheckAndUpdateAuthHeader] = useState(defaultProvider.handleCheckAndUpdateAuthHeader)
    const [counter, setCounter] = useState(0)

    const navigate = useNavigate();

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
            autoAuth(result, "/activity")
        })

        window.electronAPI.ipcRenderer.on('LogoutMnuClick', async (event, result) => {
            
            const keytarData = {
                access: "",
                refresh:  "",
                rememberMe: false
            }
            
            window.electronAPI.ipcRenderer.send("saveAccessToken", keytarData)
            navigate("/login")
            
        })

    }, [])

    const getNewAccessToken = async (refresh) => {

        try {

            const { data } = await axios.post(proxy + "https://panel.staffmonitor.app/api/token/refresh", { token: refresh })

            const keytarData = {
                access: logRemember ? data.access : "",
                refresh: logRemember ? data.refresh : "",
                rememberMe: logRemember
            }

            checkAndUpdateAuthHeader({ access: data.access, refresh: data.refresh })
            window.electronAPI.ipcRenderer.send("saveAccessToken", keytarData)
            return data.access

        } catch (error) {
            return null
        }

    }


    const autoAuth = async (result, url) => {
        const { access, refresh } = result;

        checkAndUpdateAuthHeader({ access, refresh })

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
                //checkAndUpdateAuthHeader(response.data)
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

    const checkAndUpdateAuthHeader = (data) => {

        setHandleCheckAndUpdateAuthHeader((handleCheckAndUpdateAuthHeader) => {
            if (handleCheckAndUpdateAuthHeader) {
                clearInterval(handleCheckAndUpdateAuthHeader)
            }
            return null;
        })

        setHandleCheckAndUpdateAuthHeader(
            setInterval(() =>
                setCounter((counter) => {
                    console.log((counter/60).toFixed(0)," mins")
                    if (counter < 1200) {
                        return counter + 1
                    } else {
                        RefreshToken(data)
                        return 0
                    }

                })
                , 1000)
        )


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