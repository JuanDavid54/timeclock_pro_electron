import React, {
    createContext,
    useState,
    useEffect
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
    const [authData, setAuthData] = useState(null);

    const navigate = useNavigate();


    useEffect(() => {

        const requestInterceptor = axios.interceptors.request.use(

            config => {

                if(!authData){
                    return config;
                }
                else if ("access" in authData) {
                    config.headers.Authorization = `Bearer ${authData.access}`;
                }

                return config;

            },
            error => Promise.reject(error)
        );

        const responseInterceptor = axios.interceptors.response.use(
            response => response,
            async error => {
                const originalRequest = error.config;
                if (
                    error.response.status === 401 &&
                    !originalRequest._retry
                ) {
                    originalRequest._retry = true;
                    const newToken = await RefreshToken(authData)//await fetch('url_del_servidor', { method: 'POST' });
                    console.log("token refrescado:",newToken)
                    originalRequest.headers.Authorization = `Bearer ${newToken}`;
                    return axios(originalRequest);
                }
                return Promise.reject(error);
            }
        );

        return () => {
            // Eliminar los interceptores al desmontar el componente
            axios.interceptors.request.eject(requestInterceptor);
            axios.interceptors.response.eject(responseInterceptor);
        };

    }, [authData])

    useEffectOnce(() => {
        //console.log(window)
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
         
            const keytarData = {
                access: "",
                refresh:  "",
                rememberMe: false
            }
            
   
            window.electronAPI.ipcRenderer.send("saveAccessToken", keytarData)
            navigate("/login")
            
        })

        window.electronAPI.ipcRenderer.on('refreshtoken_on_resume', async (event, result) => { 
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

    const handleLogin = async (params, errorCallback) => {
        
        try {
            
            const response= await axios.post(proxy + "https://panel.staffmonitor.app/api/token/access", params) 
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

        } catch (error) {
            if (errorCallback) errorCallback(error)     
        }

    }


    /*(params, errorCallback) => {
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
    }*/

    const RefreshToken = async ({ access, refresh }) => {

        if (!access || !refresh) {
            return;
        }

        const newToken = await getNewAccessToken(refresh)
        //access = newToken;
        if (newToken) {
            axios.defaults.headers.common['Authorization'] = "Bearer " + newToken;
            return newToken
        } else {
            return ""
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