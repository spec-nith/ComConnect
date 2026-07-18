import React, { useState } from "react";
import {
  Box,
  Button,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Text,
  useDisclosure,
} from "@chakra-ui/react";
import { FiMic } from "react-icons/fi";

import VoiceAgentPanel from "./VoiceAgentPanel";

const VoiceAgentLauncher = ({ workspaceId, onTasksCreated }) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [autoStartSignal, setAutoStartSignal] = useState(0);
  const [closeSignal, setCloseSignal] = useState(0);
  const agentName = "Vconnect";

  if (!workspaceId) return null;

  const openAgent = () => {
    setAutoStartSignal((current) => current + 1);
    onOpen();
  };
  const closeAgent = () => {
    setCloseSignal((current) => current + 1);
    onClose();
  };

  return (
    <>
      <Button
        leftIcon={<FiMic />}
        onClick={openAgent}
        px={{ base: 2, md: 3 }}
        minW={{ base: "34px", md: "auto" }}
        h={{ base: "34px", md: "36px" }}
        bg="#34d399"
        color="#07120e"
        borderRadius="6px"
        fontWeight="800"
        _hover={{ bg: "#6ee7b7" }}
        title="Start Voice Agent"
      >
        <Text display={{ base: "none", md: "inline" }}>Start Voice Agent</Text>
      </Button>

      <Modal isOpen={isOpen} onClose={closeAgent} size="2xl" isCentered>
        <ModalOverlay bg="blackAlpha.800" backdropFilter="blur(4px)" />
        <ModalContent bg="#171c1b" color="#eef4f1" border="1px solid #3a4541">
          <ModalHeader borderBottom="1px solid #313b37">
            <Box>
              <Text fontSize="lg">{agentName} voice agent</Text>
              <Text color="#8f9d97" fontSize="xs" fontWeight="400" mt={1}>
                Speak, ask about workspace chats, plan work, allocate tasks, or call the helpline
              </Text>
            </Box>
          </ModalHeader>
          <ModalCloseButton _hover={{ bg: "#2c3532" }} />
          <ModalBody py={4}>
            <VoiceAgentPanel
              workspaceId={workspaceId}
              onTasksCreated={onTasksCreated}
              autoStartSignal={autoStartSignal}
              closeSignal={closeSignal}
              agentName={agentName}
            />
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
};

export default VoiceAgentLauncher;
