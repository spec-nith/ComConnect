import {
  Box,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerOverlay,
  IconButton,
  useDisclosure,
} from "@chakra-ui/react";
import { FiMenu } from "react-icons/fi";
import { useState } from "react";
import Chatbox from "../components/Chatbox";
import MyChats from "../components/MyChats";
import { ChatState } from "../Context/ChatProvider";
import "./chat.css";

const Chatpage = () => {
  const [fetchAgain, setFetchAgain] = useState(false);
  const { user, selectedChat } = ChatState();
  const navigation = useDisclosure();

  return (
    <Box className="workspace-shell">
      <Box as="aside" className="workspace-sidebar">
        {user && <MyChats fetchAgain={fetchAgain} />}
      </Box>

      <Box as="section" className="workspace-conversation">
        <IconButton
          className="mobile-nav-trigger"
          icon={<FiMenu />}
          aria-label="Open conversations"
          title="Open conversations"
          onClick={navigation.onOpen}
          display={selectedChat ? "none" : undefined}
        />
        {user && (
          <Chatbox fetchAgain={fetchAgain} setFetchAgain={setFetchAgain} />
        )}
      </Box>

      <Drawer
        isOpen={navigation.isOpen}
        placement="left"
        onClose={navigation.onClose}
        size="xs"
      >
        <DrawerOverlay />
        <DrawerContent bg="#171c1b" maxW="min(360px, 90vw)">
          <DrawerBody p={0}>
            {user && <MyChats fetchAgain={fetchAgain} />}
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </Box>
  );
};

export default Chatpage;
