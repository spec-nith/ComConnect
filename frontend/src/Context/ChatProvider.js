import React, { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import axios from "axios";
import { API_URL } from "../config/api.config";

const ChatContext = createContext();

const firebaseConfig = {
  apiKey: "AIzaSyC2ZYTLEBAcMvmYa5fhQdDoUrcWa9YzdTA",
  authDomain: "comconnect-2b1d7.firebaseapp.com",
  projectId: "comconnect-2b1d7",
  storageBucket: "comconnect-2b1d7.firebasestorage.app",
  messagingSenderId: "854170103458",
  appId: "1:854170103458:web:9661dd687bcdf4e12db1fb",
  measurementId: "G-EHQ1LTCGJS",
};

const ChatProvider = ({ children }) => {
  const [selectedChat, setSelectedChat] = useState();
  const [user, setUser] = useState();
  const [notification, setNotification] = useState([]);
  const [chats, setChats] = useState();
  const navigate = useNavigate();

  useEffect(() => {
    const userInfo = JSON.parse(localStorage.getItem("userInfo"));
    setUser(userInfo);
    if (!userInfo) navigate("/");

    const savedChat = localStorage.getItem("selectedChat");
    if (savedChat) {
      try {
        setSelectedChat(JSON.parse(savedChat));
      } catch (error) {
        localStorage.removeItem("selectedChat");
      }
    }
  }, [navigate]);

  useEffect(() => {
    if (
      !user?.token ||
      !("Notification" in window) ||
      Notification.permission !== "granted" ||
      !("serviceWorker" in navigator)
    ) {
      return undefined;
    }

    let unsubscribe;
    const initializeNotifications = async () => {
      try {
        const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
        const registration = await navigator.serviceWorker.register(
          "/firebase-messaging-sw.js"
        );
        await navigator.serviceWorker.ready;
        const messaging = getMessaging(app);
        const token = await getToken(messaging, {
          vapidKey:
            "BG2WUN3-ZbSy5ZcsEA6Jz0A84aYStjpe59fwTTVNsCPF6zS9mNN4gGR7iHzw4EUfneHkAQektAhblloHt0_0Pb0",
          serviceWorkerRegistration: registration,
        });

        if (token) {
          await axios.post(
            `${API_URL}/notification/token`,
            { fcmToken: token },
            { headers: { Authorization: `Bearer ${user.token}` } }
          );
        }

        unsubscribe = onMessage(messaging, (payload) => {
          setNotification((current) => [...current, payload.data]);
        });
      } catch (error) {
        console.error("Firebase notification initialization failed:", error);
      }
    };

    initializeNotifications();
    return () => unsubscribe?.();
  }, [user]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;

    const handleMessage = (event) => {
      if (event.data.type === "OPEN_CHAT" && event.data.chatId) {
        setSelectedChat(event.data.chatId);
      }
    };
    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, []);

  const updateSelectedChat = (chat) => {
    setSelectedChat(chat);
    if (chat) {
      localStorage.setItem("selectedChat", JSON.stringify(chat));
    } else {
      localStorage.removeItem("selectedChat");
    }
  };

  return (
    <ChatContext.Provider
      value={{
        selectedChat,
        setSelectedChat: updateSelectedChat,
        user,
        setUser,
        notification,
        setNotification,
        chats,
        setChats,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const ChatState = () => useContext(ChatContext);

export default ChatProvider;
