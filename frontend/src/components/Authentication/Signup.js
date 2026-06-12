import {
  Box,
  Button,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  SimpleGrid,
  VStack,
  useToast,
} from "@chakra-ui/react";
import { ViewIcon, ViewOffIcon } from "@chakra-ui/icons";
import axios from "axios";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../../config/api.config";

const inputStyles = {
  bg: "#171c1b",
  borderColor: "#3a4541",
  color: "#eef4f1",
  _placeholder: { color: "#6f7d77" },
  _hover: { borderColor: "#52615b" },
};

const Signup = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    pic: "",
  });
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  const update = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const uploadPicture = async (file) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast({ title: "Choose a JPG, PNG, or WebP image", status: "warning" });
      return;
    }

    setLoading(true);
    try {
      const upload = new FormData();
      upload.append("file", file);
      upload.append("upload_preset", "chat-app");
      upload.append("cloud_name", "piyushproj");
      const response = await fetch(
        "https://api.cloudinary.com/v1_1/piyushproj/image/upload",
        { method: "POST", body: upload }
      );
      const data = await response.json();
      setForm((current) => ({ ...current, pic: data.secure_url || data.url }));
    } catch (error) {
      toast({ title: "Profile image upload failed", status: "error" });
    } finally {
      setLoading(false);
    }
  };

  const submitHandler = async (event) => {
    event.preventDefault();
    if (!form.name || !form.email || !form.password || !form.confirmPassword) {
      toast({ title: "Complete all required fields", status: "warning" });
      return;
    }
    if (form.password !== form.confirmPassword) {
      toast({ title: "Passwords do not match", status: "warning" });
      return;
    }

    setLoading(true);
    try {
      const { data } = await axios.post(`${API_URL}/user`, {
        name: form.name,
        email: form.email,
        password: form.password,
        pic: form.pic,
      });
      localStorage.setItem("userInfo", JSON.stringify(data));
      navigate("/workspace");
    } catch (error) {
      toast({
        title: "Account creation failed",
        description: error.response?.data?.message || error.message,
        status: "error",
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box as="form" onSubmit={submitHandler}>
      <VStack spacing={4} align="stretch">
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          <FormControl isRequired>
            <FormLabel fontSize="sm" color="#bdc8c3">Name</FormLabel>
            <Input {...inputStyles} value={form.name} onChange={update("name")} />
          </FormControl>
          <FormControl isRequired>
            <FormLabel fontSize="sm" color="#bdc8c3">Email</FormLabel>
            <Input
              {...inputStyles}
              type="email"
              value={form.email}
              onChange={update("email")}
            />
          </FormControl>
        </SimpleGrid>
        <FormControl isRequired>
          <FormLabel fontSize="sm" color="#bdc8c3">Password</FormLabel>
          <InputGroup>
            <Input
              {...inputStyles}
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={update("password")}
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
        <FormControl isRequired>
          <FormLabel fontSize="sm" color="#bdc8c3">Confirm password</FormLabel>
          <Input
            {...inputStyles}
            type={showPassword ? "text" : "password"}
            value={form.confirmPassword}
            onChange={update("confirmPassword")}
          />
        </FormControl>
        <FormControl>
          <FormLabel fontSize="sm" color="#bdc8c3">Profile photo</FormLabel>
          <Input
            {...inputStyles}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            pt="6px"
            onChange={(event) => uploadPicture(event.target.files[0])}
          />
        </FormControl>
        <Button
          type="submit"
          isLoading={loading}
          bg="#34d399"
          color="#07120e"
          _hover={{ bg: "#6ee7b7" }}
        >
          Create account
        </Button>
      </VStack>
    </Box>
  );
};

export default Signup;
