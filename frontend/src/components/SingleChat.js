import { FormControl } from "@chakra-ui/form-control";
import { Input } from "@chakra-ui/input";
import { Box, Text, Circle } from "@chakra-ui/layout";
import "./styles.css";
import { Avatar } from "@chakra-ui/avatar";
import {
  Button,
  IconButton,
  Spinner,
  useToast,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
} from "@chakra-ui/react";
import { getSender, getSenderFull } from "../config/ChatLogics";
import { useCallback, useEffect, useState, useRef } from "react";
import axios from "axios";
import { ArrowBackIcon } from "@chakra-ui/icons";
import ProfileModal from "./miscellaneous/ProfileModal";
import ScrollableChat from "./ScrollableChat";
import "./styles.css";
import UpdateGroupChatModal from "./miscellaneous/UpdateGroupChatModal";
import { ChatState } from "../Context/ChatProvider";
import TaskDialog from "./task_allocator/TaskDialog";
import { useDisclosure } from "@chakra-ui/react";
import { API_URL } from "../config/api.config";
import UserListItem from "./userAvatar/UserListItem";
import socket from "../Context/SocketContext";
import ChatSummaryButton from "./ai/ChatSummaryButton";
import VoiceAgentLauncher from "./ai/VoiceAgentLauncher";

const SingleChat = ({ fetchAgain, setFetchAgain }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [socketConnected, setSocketConnected] = useState(false);
  const [typing, setTyping] = useState(false);
  const [istyping, setIsTyping] = useState(false);
  const [pendingMessages, setPendingMessages] = useState([]);
  const [peerPresence, setPeerPresence] = useState(null);

  // Use ref to track the currently selected chat for socket listeners
  const selectedChatCompareRef = useRef();

  // Search functionality states
  const [search, setSearch] = useState("");
  const [searchResult, setSearchResult] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);

  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    isOpen: isSearchOpen,
    onOpen: onSearchOpen,
    onClose: onSearchClose,
  } = useDisclosure();

  const {
    selectedChat,
    setSelectedChat,
    user,
    notification,
    setNotification,
    chats,
    setChats,
  } = ChatState();

  const applyReadReceipt = useCallback(({ messageIds = [], readBy }) => {
    if (!readBy || messageIds.length === 0) return;
    const readMessageIds = new Set(messageIds.map(String));
    setMessages((currentMessages) =>
      currentMessages.map((message) => {
        if (!readMessageIds.has(message._id?.toString())) return message;
        const existingReadBy = (message.readBy || []).map((reader) =>
          (reader._id || reader).toString()
        );
        if (existingReadBy.includes(readBy.toString())) return message;
        return { ...message, readBy: [...(message.readBy || []), readBy] };
      })
    );
  }, []);

  const markChatRead = useCallback(
    async (chatId = selectedChat?._id) => {
      if (!chatId || !user?.token) return;
      try {
        const { data } = await axios.put(
          `${API_URL}/message/${chatId}`,
          {},
          { headers: { Authorization: `Bearer ${user.token}` } }
        );
        applyReadReceipt(data);
        if (data.messageIds?.length) {
          socket.emit("messages read", data);
        }
      } catch (error) {
        console.error("Failed to mark messages read:", error);
      }
    },
    [applyReadReceipt, selectedChat?._id, user?.token]
  );

  const fetchMessages = async () => {
    if (!selectedChat) return;

    try {
      const config = {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      };

      setLoading(true);

      const { data } = await axios.get(
        `${API_URL}/message/${selectedChat._id}`,
        config
      );
      setMessages(data);
      markChatRead(selectedChat._id);
      setLoading(false);

      console.log("Joining chat room:", selectedChat._id);
      console.log("Socket connected:", socket.connected);
      socket.emit("join chat", selectedChat._id);
    } catch (error) {
      toast({
        title: "Error Occurred!",
        description: "Failed to Load the Messages",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
    }
  };

  // Search functionality
  const handleSearch = useCallback(async () => {
    if (!search.trim()) {
      setSearchResult([]);
      return;
    }

    try {
      setSearchLoading(true);

      const config = {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      };

      const { data } = await axios.get(
        `${API_URL}/user?search=${search}`,
        config
      );
      console.log("search", data);

      setSearchLoading(false);
      setSearchResult(data);
    } catch (error) {
      toast({
        title: "Error Occurred!",
        description: "Failed to Load the Search Results",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom-left",
      });
      setSearchLoading(false);
    }
  }, [search, toast, user?.token]);

  // Auto-search when user types
  useEffect(() => {
    if (search && isSearchOpen) {
      const debounceTimer = setTimeout(() => {
        handleSearch();
      }, 300); // Debounce for 300ms

      return () => clearTimeout(debounceTimer);
    } else if (!search) {
      setSearchResult([]);
    }
  }, [search, isSearchOpen, handleSearch]);

  const accessChat = async (userId) => {
    console.log(userId);

    try {
      setLoadingChat(true);
      const config = {
        headers: {
          "Content-type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
      };

      // Include workspaceId in the request body if available
      const requestBody = { userId };
      if (selectedChat?.workspace) {
        requestBody.workspaceId = selectedChat.workspace;
      }

      const { data } = await axios.post(`${API_URL}/chat`, requestBody, config);

      if (!chats.find((c) => c._id === data._id)) setChats([data, ...chats]);
      setSelectedChat(data);
      setLoadingChat(false);
      onSearchClose();
    } catch (error) {
      toast({
        title: "Error fetching the chat",
        description: error.message,
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom-left",
      });
      setLoadingChat(false);
    }
  };

  const sendMessage = async (event) => {
    // Check if it's an Enter key press or a direct call (button click)
    const shouldSend = !event || event.key === "Enter";

    if (shouldSend && newMessage) {
      console.log("Sending message:", newMessage);
      console.log("Socket connected:", socket.connected);

      const messageContent = newMessage;
      const tempId = `temp-${Date.now()}`;

      // Create a pending message for optimistic UI
      const pendingMessage = {
        _id: tempId,
        content: messageContent,
        sender: {
          _id: user._id,
          name: user.name,
          pic: user.pic,
        },
        chat: selectedChat,
        isPending: true,
        createdAt: new Date().toISOString(),
      };

      socket.emit("stop typing", selectedChat._id);

      // Clear input and add pending message immediately for instant feedback
      setNewMessage("");
      setPendingMessages((prev) => [...prev, pendingMessage]);

      try {
        const config = {
          headers: {
            "Content-type": "application/json",
            Authorization: `Bearer ${user.token}`,
          },
        };

        const { data } = await axios.post(
          `${API_URL}/message`,
          {
            content: messageContent,
            chatId: selectedChat._id,
          },
          config
        );

        console.log("💾 Message saved to DB:", data);
        console.log('📤 Emitting "new message" event to socket');
        console.log("👥 Chat users:", data.chat?.users);

        // Remove pending message and add real message
        setPendingMessages((prev) => prev.filter((msg) => msg._id !== tempId));
        setMessages((prevMessages) => {
          // Avoid duplicates - check if message already exists
          if (!prevMessages.some((msg) => msg._id === data._id)) {
            return [...prevMessages, data];
          }
          return prevMessages;
        });

        socket.emit("new message", data);
      } catch (error) {
        console.error("Error sending message:", error);
        // Remove pending message and restore message in input on error
        setPendingMessages((prev) => prev.filter((msg) => msg._id !== tempId));
        setNewMessage(messageContent);
        toast({
          title: "Error Occurred!",
          description: "Failed to send the Message",
          status: "error",
          duration: 5000,
          isClosable: true,
          position: "bottom",
        });
      }
    }
  };

  useEffect(() => {
    // Connect socket if not already connected
    socket.auth = { token: user.token };
    if (!socket.connected) {
      console.log("Connecting socket...");
      socket.connect();
    }

    socket.emit("setup");

    const handleConnected = () => {
      console.log("Socket connected successfully");
      setSocketConnected(true);
    };

    const handleTyping = () => setIsTyping(true);
    const handleStopTyping = () => setIsTyping(false);

    socket.on("connected", handleConnected);
    socket.on("typing", handleTyping);
    socket.on("stop typing", handleStopTyping);

    // Cleanup on unmount
    return () => {
      socket.off("connected", handleConnected);
      socket.off("typing", handleTyping);
      socket.off("stop typing", handleStopTyping);
    };
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    fetchMessages();

    // Update the ref when selectedChat changes
    selectedChatCompareRef.current = selectedChat;
    // eslint-disable-next-line
  }, [selectedChat]);

  useEffect(() => {
    if (!selectedChat || selectedChat.isGroupChat) {
      setPeerPresence(null);
      return undefined;
    }

    const peer = getSenderFull(user, selectedChat.users);
    if (!peer?._id) return undefined;

    const loadPresence = async () => {
      try {
        const { data } = await axios.get(
          `${API_URL}/chat/presence/${peer._id}`,
          { headers: { Authorization: `Bearer ${user.token}` } }
        );
        setPeerPresence(data);
      } catch {
        setPeerPresence(null);
      }
    };
    const handlePresence = (state) => {
      if (state.userId === peer._id) setPeerPresence(state);
    };

    loadPresence();
    socket.on("presence changed", handlePresence);
    return () => socket.off("presence changed", handlePresence);
  }, [selectedChat, user]);

  useEffect(() => {
    const handleMessageReceived = (newMessageRecieved) => {
      console.log("📨 Message received from socket:", newMessageRecieved);
      console.log("📋 Current selected chat:", selectedChatCompareRef.current);

      if (
        !selectedChatCompareRef.current ||
        selectedChatCompareRef.current._id !== newMessageRecieved.chat._id
      ) {
        // Message is for a different chat - add to notifications
        console.log(
          "🔔 Message is for different chat - adding to notifications"
        );
        setNotification((prevNotifications) => {
          if (
            !prevNotifications.some(
              (notif) => notif._id === newMessageRecieved._id
            )
          ) {
            return [newMessageRecieved, ...prevNotifications];
          }
          return prevNotifications;
        });
        setFetchAgain((prev) => !prev);
      } else {
        // Message is for current chat - display it immediately
        console.log("✅ Message is for current chat - displaying in real-time");
        setMessages((prevMessages) => {
          // Avoid duplicates - check if message already exists
          if (!prevMessages.some((msg) => msg._id === newMessageRecieved._id)) {
            return [...prevMessages, newMessageRecieved];
          }
          return prevMessages;
        });
        markChatRead(newMessageRecieved.chat._id);
      }
    };

    // Register the socket listener
    socket.on("message recieved", handleMessageReceived);
    console.log('🎧 Socket listener registered for "message recieved"');

    // Clean up the event listener when dependencies change or component unmounts
    return () => {
      socket.off("message recieved", handleMessageReceived);
      console.log('🔇 Socket listener removed for "message recieved"');
    };
  }, [markChatRead, setFetchAgain, setNotification]);

  useEffect(() => {
    const handleMessagesRead = (receipt) => {
      if (receipt.chatId === selectedChatCompareRef.current?._id) {
        applyReadReceipt(receipt);
      }
    };

    socket.on("messages read", handleMessagesRead);
    return () => socket.off("messages read", handleMessagesRead);
  }, [applyReadReceipt]);

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        isSearchOpen &&
        !event.target.closest(".search-dropdown") &&
        !event.target.closest("input")
      ) {
        onSearchClose();
        setSearch("");
        setSearchResult([]);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isSearchOpen, onSearchClose]);

  const typingHandler = (e) => {
    setNewMessage(e.target.value);

    if (e.target.value === "/task") {
      onOpen();
      setNewMessage("");
    }

    if (!socketConnected) return;

    if (!typing) {
      setTyping(true);
      socket.emit("typing", selectedChat._id);
    }
    let lastTypingTime = new Date().getTime();
    var timerLength = 3000;
    setTimeout(() => {
      var timeNow = new Date().getTime();
      var timeDiff = timeNow - lastTypingTime;
      if (timeDiff >= timerLength && typing) {
        socket.emit("stop typing", selectedChat._id);
        setTyping(false);
      }
    }, timerLength);
  };

  const logoutHandler = () => {
    localStorage.removeItem("userInfo");
    window.location.href = "/";
  };

  return (
    <Box display="flex" height="100dvh" w="100%" minW={0} maxW="100vw" overflow="hidden">
      {/* Chat area fills remaining space */}
      <Box flex={1} minW={0} height="100dvh" position="relative" overflow="hidden">
        {selectedChat ? (
          <Box d="flex" flexDir="column" bg="#101414" w="100%" height="100dvh">
            <Box
              className="chat-header"
              bg="#171c1b"
              display="flex"
              flexDirection="row"
              alignItems={"center"}
              width="100%"
              px={3}
              py={2}
              gap={3}
              minH="64px"
              borderBottom="1px solid #313b37"
            >
              <IconButton
                d={{ base: "flex", md: "none" }}
                bg="#202725"
                borderRadius="6px"
                border="1px solid #3a4541"
                _hover={{ bg: "#2c3532" }}
                icon={<ArrowBackIcon color="white" />}
                onClick={() => setSelectedChat("")}
                flexShrink={0}
              />
              <Box
                className="chat-header-title"
                flex="1"
                minW={0}
                display="flex"
                alignItems="center"
                color="#fff"
                fontSize={{ base: "17px", md: "18px" }}
                fontWeight="700"
              >
                {messages &&
                  (!selectedChat.isGroupChat ? (
                    <ProfileModal
                      user={getSenderFull(user, selectedChat.users)}
                    >
                      <Box width="100%" cursor="pointer">
                        <Text fontSize={{ base: "17px", md: "18px" }} fontWeight="700">
                          {getSender(user, selectedChat.users)}
                        </Text>
                        <Text
                          color={peerPresence?.online ? "#6ee7b7" : "#8f9d97"}
                          fontSize="11px"
                          fontWeight="500"
                        >
                          {peerPresence?.online ? "Online" : "Offline"}
                        </Text>
                      </Box>
                    </ProfileModal>
                  ) : (
                    <UpdateGroupChatModal
                      fetchMessages={fetchMessages}
                      fetchAgain={fetchAgain}
                      setFetchAgain={setFetchAgain}
                    >
                      <Box width="100%" cursor="pointer">
                        {selectedChat.chatName}
                      </Box>
                    </UpdateGroupChatModal>
                  ))}
              </Box>
              <Box
                className="chat-header-actions"
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                gap={{ base: 1, md: 3 }}
              >
                <Box display="flex" alignItems="center" gap={{ base: 1, md: 2 }}>
                  <VoiceAgentLauncher
                    workspaceId={selectedChat?.workspace}
                    onTasksCreated={() => setFetchAgain((prev) => !prev)}
                  />
                  <Box display={{ base: "none", sm: "block" }}>
                    {selectedChat.isGroupChat && (
                      <ChatSummaryButton chatId={selectedChat._id} />
                    )}
                  </Box>
                  <Box position="relative">
                    {/* Search Button/Input - Expands when clicked */}
                    <Box
                      display="flex"
                      alignItems="center"
                      bg="#202725"
                      borderRadius="6px"
                      border="1px solid #3a4541"
                      _hover={{ bg: "#2c3532" }}
                      transition="all 0.2s ease-in-out"
                      width={{
                        base: isSearchOpen ? "min(260px, calc(100vw - 20px))" : "34px",
                        md: isSearchOpen ? "300px" : "auto",
                      }}
                      position={{ base: isSearchOpen ? "fixed" : "relative", md: "relative" }}
                      top={{ base: isSearchOpen ? "10px" : "auto", md: "auto" }}
                      right={{ base: isSearchOpen ? "10px" : "auto", md: "auto" }}
                      zIndex={isSearchOpen ? 1400 : "auto"}
                      p={isSearchOpen ? "0px 0px" : "0"}
                      pr={isSearchOpen ? 2 : 0}
                    >
                      {!isSearchOpen ? (
                        <Button
                          p={0}
                          bg="transparent"
                          _hover={{ bg: "transparent" }}
                          onClick={onSearchOpen}
                          title="Search Users to chat"
                        >
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 18 18"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              fillRule="evenodd"
                              clipRule="evenodd"
                              d="M16.9422 16.0578L13.0305 12.1469C15.3858 9.3192 15.1004 5.13911 12.3826 2.65779C9.66485 0.176469 5.47612 0.271665 2.87389 2.87389C0.271665 5.47612 0.176469 9.66485 2.65779 12.3826C5.13911 15.1004 9.3192 15.3858 12.1469 13.0305L16.0578 16.9422C16.302 17.1864 16.698 17.1864 16.9422 16.9422C17.1864 16.698 17.1864 16.302 16.9422 16.0578ZM2.125 7.75C2.125 4.6434 4.6434 2.125 7.75 2.125C10.8566 2.125 13.375 4.6434 13.375 7.75C13.375 10.8566 10.8566 13.375 7.75 13.375C4.64483 13.3716 2.12844 10.8552 2.125 7.75Z"
                              fill="white"
                            />
                          </svg>
                        </Button>
                      ) : (
                        <Box
                          display="flex"
                          alignItems="center"
                          width="100%"
                          gap={2}
                        >
                          <Input
                            placeholder="Search by name or email"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleSearch();
                              }
                              if (e.key === "Escape") {
                                onSearchClose();
                              }
                            }}
                            bg="transparent"
                            border="none"
                            color="white"
                            _placeholder={{ color: "gray.300" }}
                            _focus={{ outline: "none", boxShadow: "none" }}
                            autoFocus
                            fontSize="sm"
                            autoComplete="off"
                            autoCorrect="off"
                            spellCheck="false"
                          />
                          <Button
                            size="xs"
                            bg="transparent"
                            color="white"
                            _hover={{ bg: "whiteAlpha.200" }}
                            onClick={onSearchClose}
                            minW="auto"
                            p={1}
                          >
                            ✕
                          </Button>
                        </Box>
                      )}
                    </Box>

                    {/* Search Results Dropdown */}
                    {isSearchOpen &&
                      (search || searchResult.length > 0 || searchLoading) && (
                        <Box
                          className="search-dropdown"
                          position="absolute"
                          top="calc(100% + 8px)"
                          right="0"
                          left="0"
                          bg="#171c1b"
                          boxShadow="lg"
                          borderRadius="md"
                          zIndex="1000"
                          border="1px solid"
                          borderColor="#313b37"
                          maxH="250px"
                          overflowY="auto"
                          p={2}
                          sx={{
                            animation: "slideDown 0.2s ease-out",
                          }}
                        >
                          {searchLoading ? (
                            <Box textAlign="center" py={4}>
                              <Spinner size="sm" color="white" />
                              <Text fontSize="sm" color="gray.300" mt={2}>
                                Searching...
                              </Text>
                            </Box>
                          ) : (
                            <>
                              {searchResult?.length > 0
                                ? searchResult.map((user) => (
                                    <UserListItem
                                      key={user._id}
                                      user={user}
                                      handleFunction={() =>
                                        accessChat(user._id)
                                      }
                                    />
                                  ))
                                : search &&
                                  !searchLoading && (
                                    <Box textAlign="center" py={4}>
                                      <Text color="gray.300" fontSize="sm">
                                        No users found for "{search}"
                                      </Text>
                                    </Box>
                                  )}
                            </>
                          )}
                          {loadingChat && (
                            <Box
                              textAlign="center"
                              py={2}
                              borderTop="1px solid"
                              borderColor="#2982db20"
                            >
                              <Spinner size="sm" color="white" />
                              <Text fontSize="sm" color="gray.300" mt={1}>
                                Opening chat...
                              </Text>
                            </Box>
                          )}
                        </Box>
                      )}
                  </Box>

                  <Button
                    p={{ base: 0, md: 3 }}
                    minW={{ base: "34px", md: "auto" }}
                    w={{ base: "34px", md: "auto" }}
                    h={{ base: "34px", md: "auto" }}
                    bg="#202725"
                    borderRadius="6px"
                    border="1px solid #3a4541"
                    onClick={onOpen}
                    _hover={{ bg: "#2c3532" }}
                    title="Allocate New Task"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M8 1C8.27614 1 8.5 1.22386 8.5 1.5V7.5H14.5C14.7761 7.5 15 7.72386 15 8C15 8.27614 14.7761 8.5 14.5 8.5H8.5V14.5C8.5 14.7761 8.27614 15 8 15C7.72386 15 7.5 14.7761 7.5 14.5V8.5H1.5C1.22386 8.5 1 8.27614 1 8C1 7.72386 1.22386 7.5 1.5 7.5H7.5V1.5C7.5 1.22386 7.72386 1 8 1Z"
                        fill="white"
                      />
                    </svg>
                  </Button>

                  <Menu>
                    <MenuButton
                      p={{ base: 0, md: 3 }}
                      minW={{ base: "34px", md: "auto" }}
                      w={{ base: "34px", md: "auto" }}
                      h={{ base: "34px", md: "auto" }}
                      borderRadius="6px"
                      display="flex"
                      alignItems="center"
                      alignContent={"center"}
                      bg="#202725"
                      title="Notifications"
                      border="1px solid #3a4541"
                      _hover={{ bg: "#2c3532" }}
                    >
                      <Box>
                        <svg
                          width="16"
                          height="18"
                          viewBox="0 0 16 18"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M15.3281 12.7453C14.8945 11.9984 14.25 9.88516 14.25 7.125C14.25 3.67322 11.4518 0.875 8 0.875C4.54822 0.875 1.75 3.67322 1.75 7.125C1.75 9.88594 1.10469 11.9984 0.671094 12.7453C0.445722 13.1318 0.444082 13.6092 0.666796 13.9973C0.889509 14.3853 1.30261 14.6247 1.75 14.625H4.93828C5.23556 16.0796 6.51529 17.1243 8 17.1243C9.48471 17.1243 10.7644 16.0796 11.0617 14.625H14.25C14.6972 14.6244 15.1101 14.3849 15.3326 13.9969C15.5551 13.609 15.5534 13.1317 15.3281 12.7453ZM8 15.875C7.20562 15.8748 6.49761 15.3739 6.23281 14.625H9.76719C9.50239 15.3739 8.79438 15.8748 8 15.875ZM1.75 13.375C2.35156 12.3406 3 9.94375 3 7.125C3 4.36358 5.23858 2.125 8 2.125C10.7614 2.125 13 4.36358 13 7.125C13 9.94141 13.6469 12.3383 14.25 13.375H1.75Z"
                            fill="white"
                          />
                        </svg>
                        {notification.length > 0 && (
                          <Circle
                            size="20px"
                            bg="red.500"
                            color="white"
                            position="absolute"
                            top="-8px"
                            right="-8px"
                            fontSize="12px"
                          >
                            {notification.length}
                          </Circle>
                        )}
                      </Box>
                    </MenuButton>
                    <MenuList border="1px solid #313b37" bg="#171c1b">
                      {notification.length === 0 ? (
                        <MenuItem
                          fontSize={"sm"}
                          textColor={"gray.300"}
                          bg="#171c1b"
                          display="flex"
                          justifyContent="center"
                          alignItems="center"
                          width="100%"
                        >
                          No new notifications
                        </MenuItem>
                      ) : (
                        notification.map((notif, idx) => (
                          <MenuItem key={idx}>
                            {notif.message || "New notification"}
                          </MenuItem>
                        ))
                      )}
                    </MenuList>
                  </Menu>
                </Box>
                <Box flexShrink={0}>
                  <Menu>
                    <MenuButton
                      as={Button}
                      bg="#202725"
                      _hover={{ bg: "#2c3532" }}
                      _active={{ bg: "#2c3532" }}
                      borderRadius="100%"
                      minW={{ base: "34px", md: "45px" }}
                      w={{ base: "34px", md: "45px" }}
                      h={{ base: "34px", md: "45px" }}
                      display={"flex"}
                      alignItems={"center"}
                      justifyContent={"center"}
                      position={"relative"}
                    >
                      <Avatar
                        size="sm"
                        position={"absolute"}
                        transform={"translate(-50%, -50%)"}
                        cursor="pointer"
                        name={user.name}
                        src={user.pic}
                      />
                    </MenuButton>
                    <MenuList
                      border="1px solid #313b37"
                      bg="#171c1b"
                      textColor={"white"}
                    >
                      <ProfileModal user={user}>
                        <MenuItem fontSize={"sm"} bg="#171c1b">
                          My Profile
                        </MenuItem>{" "}
                      </ProfileModal>
                      <MenuDivider />
                      <MenuItem
                        fontSize={"sm"}
                        bg="#171c1b"
                        onClick={logoutHandler}
                      >
                        Logout
                      </MenuItem>
                    </MenuList>
                  </Menu>
                </Box>
              </Box>
            </Box>
            <Box
              display="flex"
              flexDir="column"
              bg="transparent"
              w="100%"
              height="calc(100dvh - 64px)"
              overflow="hidden"
            >
              {loading ? (
                <Box
                  flex="1"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Spinner size="xl" w={20} h={20} />
                </Box>
              ) : (
                <Box
                  scrollBehavior={"smooth"}
                  overflowY={"auto"}
                  overflowX="hidden"
                  flex="1"
                  minHeight={0}
                  pb={{ base: "76px", md: "90px" }}
                  sx={{
                    // Custom scrollbar styling for webkit browsers
                    "&::-webkit-scrollbar": {
                      width: "2px",
                    },
                    "&::-webkit-scrollbar-track": {
                      background: "#202725",
                      borderRadius: "4px",
                      margin: "4px 0",
                    },
                    "&::-webkit-scrollbar-thumb": {
                      background: "#46534e",
                      borderRadius: "4px",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      transition: "all 0.2s ease",
                    },
                    "&::-webkit-scrollbar-thumb:hover": {
                      background: "#5a6963",
                      border: "1px solid rgba(255, 255, 255, 0.2)",
                      transform: "scaleX(1.2)",
                    },
                    "&::-webkit-scrollbar-thumb:active": {
                      background: "#6a7973",
                    },
                    "&::-webkit-scrollbar-corner": {
                      background: "transparent",
                    },
                    scrollbarWidth: "thin",
                    scrollbarColor: "#46534e #101414",
                  }}
                >
                  <ScrollableChat
                    messages={messages}
                    pendingMessages={pendingMessages}
                  />
                </Box>
              )}

              <FormControl
                className="chat-composer"
                onKeyDown={sendMessage}
                id="first-name"
                isRequired
                position="absolute"
                bottom="0"
                left="0"
                right="0"
                width="100%"
                px={3}
                py={3}
                bg="#171c1b"
                borderTop="1px solid #313b37"
                zIndex={10}
              >
                {istyping ? <div>typing...</div> : <></>}
                <div className="chat-composer-row">
                  <Input
                    flex="1"
                    minW={0}
                    width="auto"
                    variant="filled"
                    bg="#202725"
                    borderColor="#3a4541"
                    color="white"
                    _placeholder={{ color: "gray.400" }}
                    _hover={{ borderColor: "#52615b" }}
                    _focus={{
                      borderColor: "#34d399",
                      boxShadow: "0 0 0 1px #34d399",
                      bg: "#202725",
                    }}
                    placeholder="Write a message"
                    value={newMessage}
                    onChange={typingHandler}
                    className="enteramsg"
                    m={0}
                  />
                  <Button
                    ml={2}
                    flexShrink={0}
                    minW={{ base: "42px", md: "48px" }}
                    bg="#34d399"
                    color="#07120e"
                    _hover={{ bg: "#6ee7b7" }}
                    onClick={(e) => {
                      e.preventDefault();
                      sendMessage();
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M2 21L23 12L2 3V10L17 12L2 14V21Z"
                        fill="currentColor"
                      />
                    </svg>
                  </Button>
                </div>
              </FormControl>
            </Box>
          </Box>
        ) : (
          <Box
            display="flex"
            alignItems="center"
            bg="#101414"
            justifyContent="center"
            height="100vh"
            w="100%"
          >
            <Box textAlign="center" px={6}>
              <Text fontSize="lg" fontWeight="700" color="#eef4f1">
                Choose a conversation
              </Text>
              <Text fontSize="sm" color="#8f9d97" mt={2}>
                Select a chat from the workspace sidebar to start collaborating.
              </Text>
            </Box>
          </Box>
        )}

        <TaskDialog
          isOpen={isOpen}
          onClose={onClose}
          workspaceId={selectedChat?.workspace}
          selectedChat={selectedChat}
        />
      </Box>
    </Box>
  );
};

export default SingleChat;
