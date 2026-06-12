import { Box, Button, Flex, HStack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Login from "../components/Authentication/Login";
import Signup from "../components/Authentication/Signup";
import BrandMark from "../components/brand/BrandMark";

function Homepage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");

  useEffect(() => {
    if (JSON.parse(localStorage.getItem("userInfo"))) {
      navigate("/workspace");
    }
  }, [navigate]);

  return (
    <Flex
      minH="100dvh"
      bg="#101414"
      direction="column"
      position="relative"
      overflow="hidden"
      _before={{
        content: '""',
        position: "absolute",
        width: "520px",
        height: "520px",
        top: "-260px",
        right: "-160px",
        borderRadius: "full",
        background: "rgba(52, 211, 153, 0.09)",
        filter: "blur(10px)",
        pointerEvents: "none",
      }}
      _after={{
        content: '""',
        position: "absolute",
        width: "420px",
        height: "420px",
        bottom: "-260px",
        left: "-180px",
        borderRadius: "full",
        background: "rgba(16, 185, 129, 0.07)",
        pointerEvents: "none",
      }}
    >
      <Flex
        as="header"
        h="68px"
        px={{ base: 5, md: 8 }}
        align="center"
        justify="space-between"
        borderBottom="1px solid #313b37"
        bg="rgba(16, 20, 20, 0.86)"
        backdropFilter="blur(12px)"
        position="relative"
        zIndex={1}
      >
        <HStack spacing={3}>
          <BrandMark size="38px" />
          <Box>
            <Text fontWeight="800" fontSize="lg" lineHeight="1">
              ComConnect
            </Text>
            <Text color="#6ee7b7" fontSize="10px" mt={1} letterSpacing="0.08em">
              WORK TOGETHER
            </Text>
          </Box>
        </HStack>
        <Text display={{ base: "none", md: "block" }} color="#8f9d97" fontSize="sm">
          Events, conversations, and tasks in one workspace
        </Text>
      </Flex>

      <Flex flex="1" align="center" justify="center" px={4} py={10} position="relative" zIndex={1}>
        <Box
          w="100%"
          maxW="470px"
          p={{ base: 5, md: 7 }}
          bg="rgba(23, 28, 27, 0.94)"
          border="1px solid #313b37"
          borderTop="2px solid #34d399"
          borderRadius="10px"
          boxShadow="0 24px 70px rgba(0, 0, 0, 0.32)"
        >
          <BrandMark size="48px" mb={5} />
          <Text fontSize="2xl" fontWeight="750">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </Text>
          <Text color="#9eaaa5" fontSize="sm" mt={2} mb={6}>
            {mode === "login"
              ? "Sign in to continue planning with your workspace."
              : "Join your team and keep every event detail moving."}
          </Text>

          <Flex
            p="3px"
            bg="#171c1b"
            border="1px solid #313b37"
            borderRadius="6px"
            mb={6}
          >
            {["login", "signup"].map((item) => (
              <Button
                key={item}
                flex="1"
                size="sm"
                bg={mode === item ? "#2c3532" : "transparent"}
                color={mode === item ? "#eef4f1" : "#8f9d97"}
                _hover={{ bg: "#202725" }}
                onClick={() => setMode(item)}
              >
                {item === "login" ? "Sign in" : "Create account"}
              </Button>
            ))}
          </Flex>

          {mode === "login" ? <Login /> : <Signup />}
        </Box>
      </Flex>
    </Flex>
  );
}

export default Homepage;
