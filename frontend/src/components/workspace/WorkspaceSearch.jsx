import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Spinner,
  Stack,
  Text,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import axios from "axios";
import { useCallback, useMemo, useState } from "react";
import { FiClock, FiSearch, FiTag } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../../config/api.config";
import { ChatState } from "../../Context/ChatProvider";

const WorkspaceSearch = ({ workspaceId }) => {
  const { user, chats, setSelectedChat } = ChatState();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const navigate = useNavigate();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchMeta, setSearchMeta] = useState(null);
  const [searchedTerms, setSearchedTerms] = useState({ query: "", tags: [] });
  const storageKey = `workspace-search-history:${workspaceId}`;
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey)) || [];
    } catch {
      return [];
    }
  });

  const tags = useMemo(
    () =>
      [...new Set(
        tagInput
          .split(",")
          .map((tag) => tag.trim().replace(/^#/, "").toLowerCase())
          .filter(Boolean)
      )],
    [tagInput]
  );

  const runSearch = useCallback(
    async (nextQuery = query, nextTags = tags, remember = true) => {
      if (!user?.token || !workspaceId) return;
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: nextQuery.trim(),
          tags: nextTags.join(","),
          limit: "24",
        });
        const { data } = await axios.get(
          `${API_URL}/workspace/${workspaceId}/search?${params}`,
          { headers: { Authorization: `Bearer ${user.token}` } }
        );
        setResults(data.results || []);
        setSearchMeta(data);
        setSearchedTerms({ query: nextQuery.trim(), tags: nextTags });

        if (remember && (nextQuery.trim() || nextTags.length)) {
          const entry = { query: nextQuery.trim(), tags: nextTags };
          const nextHistory = [
            entry,
            ...history.filter(
              (item) =>
                item.query !== entry.query ||
                item.tags.join(",") !== entry.tags.join(",")
            ),
          ].slice(0, 6);
          setHistory(nextHistory);
          localStorage.setItem(storageKey, JSON.stringify(nextHistory));
        }
      } catch (error) {
        toast({
          title: "Workspace search failed",
          description: error.response?.data?.message || error.message,
          status: "error",
        });
      } finally {
        setLoading(false);
      }
    },
    [history, query, storageKey, tags, toast, user?.token, workspaceId]
  );

  const openSearch = () => {
    onOpen();
    runSearch("", [], false);
  };

  const hasSearchTerms = Boolean(
    searchedTerms.query || searchedTerms.tags.length
  );
  const resultSummary = searchMeta
    ? hasSearchTerms
      ? `${searchMeta.resultCount || results.length} results`
      : `${searchMeta.workspaceMessageCount ?? searchMeta.messageCount ?? 0} workspace messages`
    : "";
  const matchSummary =
    searchMeta && hasSearchTerms
      ? `${searchMeta.matchedMessageCount ?? 0} message matches, ${
          searchMeta.matchedTaskCount ?? 0
        } task matches`
      : "";

  const selectResult = (result) => {
    if (result.type === "task") {
      navigate(`/tasks/${workspaceId}`);
      onClose();
      return;
    }
    const chat = chats?.find((item) => item._id === result.chatId);
    if (chat) setSelectedChat(chat);
    onClose();
  };

  return (
    <>
      <Button
        leftIcon={<FiSearch />}
        size="sm"
        variant="outline"
        color="#dce6e1"
        borderColor="#3a4541"
        _hover={{ bg: "#202725", borderColor: "#52615b" }}
        onClick={openSearch}
      >
        Search
      </Button>

      <Modal isOpen={isOpen} onClose={onClose} size="2xl" isCentered>
        <ModalOverlay bg="blackAlpha.800" backdropFilter="blur(4px)" />
        <ModalContent bg="#171c1b" color="#eef4f1" border="1px solid #3a4541">
          <ModalHeader borderBottom="1px solid #313b37">
            <Text fontSize="lg">Search workspace</Text>
            <Text mt={1} color="#8f9d97" fontSize="xs" fontWeight="400">
              Messages, tasks, tags, and recent activity
            </Text>
          </ModalHeader>
          <ModalCloseButton _hover={{ bg: "#2c3532" }} />
          <ModalBody py={5}>
            <Stack spacing={3}>
              <HStack align="stretch">
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && runSearch()}
                  placeholder="Search decisions, people, tasks..."
                  bg="#202725"
                  borderColor="#3a4541"
                />
                <Button
                  bg="#34d399"
                  color="#07120e"
                  leftIcon={<FiSearch />}
                  onClick={() => runSearch()}
                  isLoading={loading}
                  _hover={{ bg: "#6ee7b7" }}
                >
                  Search
                </Button>
              </HStack>
              <HStack>
                <FiTag color="#8f9d97" />
                <Input
                  size="sm"
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  placeholder="Filter tags: venue, launch, urgent"
                  bg="#202725"
                  borderColor="#3a4541"
                />
              </HStack>

              {history.length > 0 && (
                <Box>
                  <HStack color="#8f9d97" mb={2}>
                    <FiClock />
                    <Text fontSize="xs" fontWeight="700" textTransform="uppercase">
                      Recent searches
                    </Text>
                  </HStack>
                  <Flex gap={2} wrap="wrap">
                    {history.map((item, index) => (
                      <Button
                        key={`${item.query}-${item.tags.join("-")}-${index}`}
                        size="xs"
                        bg="#202725"
                        color="#bdc8c3"
                        _hover={{ bg: "#2c3532" }}
                        onClick={() => {
                          setQuery(item.query);
                          setTagInput(item.tags.join(", "));
                          runSearch(item.query, item.tags, false);
                        }}
                      >
                        {item.query || item.tags.map((tag) => `#${tag}`).join(" ")}
                      </Button>
                    ))}
                  </Flex>
                </Box>
              )}

              <Flex align="center" justify="space-between" pt={2}>
                <Text color="#8f9d97" fontSize="xs">
                  {searchMeta?.strategy === "hybrid-rag"
                    ? "Hybrid keyword + semantic retrieval"
                    : "Recent and exact workspace history"}
                  {matchSummary ? ` - ${matchSummary}` : ""}
                </Text>
                {searchMeta && (
                  <Badge bg="#26332e" color="#6ee7b7">
                    {resultSummary}
                  </Badge>
                )}
              </Flex>

              {loading ? (
                <Flex minH="180px" align="center" justify="center">
                  <Spinner color="#34d399" />
                </Flex>
              ) : results.length ? (
                <Stack spacing={2} maxH="390px" overflowY="auto">
                  {results.map((result) => (
                    <Box
                      key={`${result.type}-${result.sourceId}`}
                      as="button"
                      type="button"
                      textAlign="left"
                      p={3}
                      bg="#202725"
                      border="1px solid #313b37"
                      _hover={{ borderColor: "#52615b", bg: "#242c29" }}
                      onClick={() => selectResult(result)}
                    >
                      <Flex justify="space-between" gap={3}>
                        <Text fontSize="sm" fontWeight="700" noOfLines={1}>
                          {result.title || result.label}
                        </Text>
                        <Badge bg="#2c3532" color="#9eaaa5">
                          {result.type}
                        </Badge>
                      </Flex>
                      <Text mt={1} color="#9eaaa5" fontSize="xs" noOfLines={2}>
                        {result.excerpt}
                      </Text>
                      {result.tags?.length > 0 && (
                        <Flex gap={1} mt={2} wrap="wrap">
                          {result.tags.map((tag) => (
                            <Text key={tag} color="#6ee7b7" fontSize="10px">
                              #{tag}
                            </Text>
                          ))}
                        </Flex>
                      )}
                    </Box>
                  ))}
                </Stack>
              ) : (
                <Flex minH="180px" align="center" justify="center">
                  <Text color="#6f7d77" fontSize="sm">
                    No matching workspace history
                  </Text>
                </Flex>
              )}
            </Stack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
};

export default WorkspaceSearch;
