import {
  Box,
  Button,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  VStack,
  useToast,
} from "@chakra-ui/react";
import { ViewIcon, ViewOffIcon } from "@chakra-ui/icons";
import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { ChatState } from "../../Context/ChatProvider";
import { API_URL } from "../../config/api.config";

const inputStyles = {
  bg: "#171c1b",
  borderColor: "#3a4541",
  color: "#eef4f1",
  _placeholder: { color: "#6f7d77" },
  _hover: { borderColor: "#52615b" },
};

const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const { setUser } = ChatState();

  const submitHandler = async (event) => {
    event.preventDefault();
    if (!email || !password) {
      toast({ title: "Email and password are required", status: "warning" });
      return;
    }

    setLoading(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/user/login`,
        { email, password },
        { timeout: 30000 }
      );
      setUser(data);
      localStorage.setItem("userInfo", JSON.stringify(data));
      navigate("/workspace");
    } catch (error) {
      toast({
        title: "Sign in failed",
        description: error.response?.data?.message || "Please check your connection.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box as="form" onSubmit={submitHandler}>
      <VStack spacing={4} align="stretch">
        <FormControl isRequired>
          <FormLabel fontSize="sm" color="#bdc8c3">
            Email
          </FormLabel>
          <Input
            {...inputStyles}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </FormControl>
        <FormControl isRequired>
          <FormLabel fontSize="sm" color="#bdc8c3">
            Password
          </FormLabel>
          <InputGroup>
            <Input
              {...inputStyles}
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <InputRightElement>
              <IconButton
                variant="ghost"
                size="sm"
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
                icon={showPassword ? <ViewOffIcon /> : <ViewIcon />}
                onClick={() => setShowPassword((value) => !value)}
              />
            </InputRightElement>
          </InputGroup>
        </FormControl>
        <Button
          type="submit"
          isLoading={loading}
          bg="#34d399"
          color="#07120e"
          _hover={{ bg: "#6ee7b7" }}
          w="100%"
        >
          Sign in
        </Button>
      </VStack>
    </Box>
  );
};

export default Login;
