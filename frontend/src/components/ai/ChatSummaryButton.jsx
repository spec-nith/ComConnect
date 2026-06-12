import React, { useState } from "react";
import axios from "axios";
import {
  Box,
  Button,
  Divider,
  List,
  ListItem,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Text,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import { FiFileText } from "react-icons/fi";

import { API_URL } from "../../config/api.config";
import { ChatState } from "../../Context/ChatProvider";

const SummarySection = ({ title, items }) => (
  <Box>
    <Text fontSize="sm" color="gray.400" mb={2}>
      {title}
    </Text>
    {items?.length ? (
      <List spacing={2}>
        {items.map((item, index) => (
          <ListItem key={`${title}-${index}`} fontSize="sm">
            {item}
          </ListItem>
        ))}
      </List>
    ) : (
      <Text fontSize="sm" color="gray.500">
        None found
      </Text>
    )}
  </Box>
);

const ChatSummaryButton = ({ chatId }) => {
  const { user } = ChatState();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  const summarize = async () => {
    setLoading(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/ai/chats/${chatId}/summary`,
        {},
        {
          headers: { Authorization: `Bearer ${user?.token}` },
          timeout: 130000,
        }
      );
      setSummary(data.summary);
      onOpen();
    } catch (error) {
      toast({
        title: "Could not summarize chat",
        description: error.response?.data?.message || error.message,
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        leftIcon={<FiFileText />}
        onClick={summarize}
        isLoading={loading}
        bg="#202725"
        color="#dce6e1"
        border="1px solid #3a4541"
        borderRadius="6px"
        _hover={{ bg: "#2c3532" }}
        fontSize="sm"
      >
        <Box as="span" display={{ base: "none", md: "inline" }}>
          Summarize Chat
        </Box>
      </Button>

      <Modal isOpen={isOpen} onClose={onClose} size="xl" isCentered>
        <ModalOverlay bg="blackAlpha.700" />
        <ModalContent bg="#0f1924" color="white" border="1px solid #29445d">
          <ModalHeader>Chat Summary</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            {summary && (
              <Box display="flex" flexDirection="column" gap={4}>
                <Text whiteSpace="pre-wrap">{summary.short_summary}</Text>
                <Divider borderColor="#29445d" />
                <SummarySection title="Action items" items={summary.action_items} />
                <SummarySection
                  title="Unresolved questions"
                  items={summary.unresolved_questions}
                />
                <SummarySection
                  title="People mentioned"
                  items={summary.people_mentioned}
                />
                <SummarySection title="Deadlines" items={summary.deadlines} />
              </Box>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
};

export default ChatSummaryButton;
