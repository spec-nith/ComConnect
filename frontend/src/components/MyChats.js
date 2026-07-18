import React, { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Flex,
  Stack,
  Text,
  Tooltip,
  useToast,
} from "@chakra-ui/react";
import { FiCheckSquare, FiMap, FiMessageSquare, FiPlus } from "react-icons/fi";
import { useNavigate, useParams } from "react-router-dom";
import { ChatState } from "../Context/ChatProvider";
import { fetchChats } from "../utils/api";
import { API_URL } from "../config/api.config";
import { getSender } from "../config/ChatLogics";
import ChatLoading from "./ChatLoading";
import GroupChatModal from "./miscellaneous/GroupChatModal";
import WorkspaceAssistant from "./ai/WorkspaceAssistant";
import WorkspaceSearch from "./workspace/WorkspaceSearch";
import BrandMark from "./brand/BrandMark";
import socket from "../Context/SocketContext";

const MyChats = ({ fetchAgain }) => {
  const [loggedUser, setLoggedUser] = useState();
  const [presenceByUser, setPresenceByUser] = useState({});
  const { selectedChat, setSelectedChat, user, chats, setChats } = ChatState();
  const { workspaceId } = useParams();
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    setLoggedUser(JSON.parse(localStorage.getItem("userInfo")));

    const loadChats = async () => {
      try {
        const data = await fetchChats(user.token, workspaceId);
        setChats(data);
      } catch (error) {
        toast({
          title: "Could not load conversations",
          description: error.message,
          status: "error",
          duration: 4000,
          isClosable: true,
        });
      }
    };

    if (workspaceId && user?.token) loadChats();
  }, [fetchAgain, workspaceId, user?.token, setChats, toast]);

  const sortedChats = useMemo(
    () =>
      Array.isArray(chats)
        ? [...chats].sort(
            (a, b) =>
              new Date(b.latestMessage?.createdAt || b.updatedAt || 0) -
              new Date(a.latestMessage?.createdAt || a.updatedAt || 0)
          )
        : [],
    [chats]
  );

  useEffect(() => {
    const chatUserIds = (selectedChat?.users || [])
      .map((chatUser) => (chatUser?._id || chatUser)?.toString())
      .filter(Boolean);

    if (!selectedChat?._id || !user?.token || chatUserIds.length === 0) {
      setPresenceByUser({});
      return undefined;
    }

    const loadPresence = async () => {
      try {
        const response = await fetch(`${API_URL}/chat/presence`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${user.token}`,
          },
          body: JSON.stringify({ userIds: chatUserIds }),
        });
        if (!response.ok) throw new Error("Could not load presence");
        const states = await response.json();
        setPresenceByUser(
          states.reduce(
            (presence, state) => ({
              ...presence,
              [state.userId]: state,
            }),
            {}
          )
        );
      } catch (error) {
        console.error("Could not load active users:", error);
        setPresenceByUser({});
      }
    };

    const handlePresenceChanged = (state) => {
      if (!chatUserIds.includes(state.userId)) return;
      setPresenceByUser((current) => ({
        ...current,
        [state.userId]: state,
      }));
    };

    loadPresence();
    socket.on("presence changed", handlePresenceChanged);
    return () => socket.off("presence changed", handlePresenceChanged);
  }, [selectedChat, user?.token]);

  const selectedChatUserIds = (selectedChat?.users || [])
    .map((chatUser) => (chatUser?._id || chatUser)?.toString())
    .filter(Boolean);
  const activeUserCount = selectedChatUserIds.filter(
    (userId) => presenceByUser[userId]?.online
  ).length;

  return (
    <Flex direction="column" h="100dvh" bg="#171c1b" color="#eef4f1">
      <Box px={5} pt={5} pb={4} borderBottom="1px solid #313b37">
        <Flex align="center" gap={3}>
          <BrandMark size="38px" />
          <Box minW={0}>
            <Text fontWeight="750" fontSize="lg" lineHeight="1.1">
              ComConnect
            </Text>
            <Text color="#9eaaa5" fontSize="xs" mt={1}>
              Workspace collaboration
            </Text>
          </Box>
        </Flex>

        <Flex gap={2} mt={5} align="center" flexWrap="wrap">
          <GroupChatModal>
            <Button
              leftIcon={<FiPlus />}
              size="sm"
              bg="#34d399"
              color="#07120e"
              _hover={{ bg: "#6ee7b7" }}
            >
              New group
            </Button>
          </GroupChatModal>
          <Tooltip label="Open tasks">
            <Button
              aria-label="Open tasks"
              leftIcon={<FiCheckSquare />}
              size="sm"
              variant="outline"
              color="#dce6e1"
              borderColor="#3a4541"
              _hover={{ bg: "#202725", borderColor: "#52615b" }}
              onClick={() => navigate(`/tasks/${workspaceId}`)}
            >
              Tasks
            </Button>
          </Tooltip>
          <WorkspaceSearch workspaceId={workspaceId} />
          <Tooltip label="Open event map">
            <Button
              aria-label="Open event map"
              leftIcon={<FiMap />}
              size="sm"
              variant="ghost"
              color="#bdc8c3"
              onClick={() => navigate(`/workspace/${workspaceId}/map`)}
            >
              Map
            </Button>
          </Tooltip>
        </Flex>

        <Box mt={3}>
          <WorkspaceAssistant workspaceId={workspaceId} />
        </Box>
      </Box>

      <Flex px={5} py={4} align="center" justify="space-between">
        <Box>
          <Text fontSize="xs" color="#8f9d97" textTransform="uppercase" fontWeight="700">
            Conversations
          </Text>
          <Text fontSize="sm" color="#bdc8c3" mt={1}>
            {selectedChat
              ? `${activeUserCount} active ${activeUserCount === 1 ? "user" : "users"}`
              : "Select a chat"}
          </Text>
        </Box>
        <FiMessageSquare color="#34d399" />
      </Flex>

      <Box flex="1" overflowY="auto" px={3} pb={4}>
        {Array.isArray(chats) ? (
          <Stack spacing={1}>
            {sortedChats.map((chat) => {
              const title = chat.isGroupChat
                ? chat.chatName
                : getSender(loggedUser, chat.users);
              const active = selectedChat?._id === chat._id;
              return (
                <Flex
                  key={chat._id}
                  as="button"
                  type="button"
                  w="100%"
                  minH="68px"
                  align="center"
                  gap={3}
                  px={3}
                  py={2}
                  textAlign="left"
                  borderRadius="6px"
                  bg={active ? "#26332e" : "transparent"}
                  border="1px solid"
                  borderColor={active ? "#3f5f52" : "transparent"}
                  _hover={{ bg: active ? "#26332e" : "#202725" }}
                  onClick={() => setSelectedChat(chat)}
                >
                  <Avatar size="sm" name={title} bg="#2c3532" color="#dce6e1" />
                  <Box minW={0} flex="1">
                    <Text fontSize="sm" fontWeight="650" noOfLines={1}>
                      {title}
                    </Text>
                    <Text fontSize="xs" color="#8f9d97" noOfLines={1} mt={1}>
                      {chat.latestMessage
                        ? `${chat.latestMessage.sender?.name || "Member"}: ${
                            chat.latestMessage.content
                          }`
                        : "No messages yet"}
                    </Text>
                  </Box>
                  {active && <Box w="3px" h="28px" bg="#34d399" borderRadius="3px" />}
                </Flex>
              );
            })}
          </Stack>
        ) : (
          <ChatLoading />
        )}
      </Box>
    </Flex>
  );
};

export default MyChats;
