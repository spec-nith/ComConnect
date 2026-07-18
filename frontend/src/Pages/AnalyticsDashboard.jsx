import React from "react";
import {
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  Text,
} from "@chakra-ui/react";
import { FiBarChart2, FiExternalLink, FiHome } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import BrandMark from "../components/brand/BrandMark";

const dashboardsUrl =
  process.env.REACT_APP_OPENSEARCH_DASHBOARDS_URL || "http://localhost:5601";

const AnalyticsDashboard = () => {
  const navigate = useNavigate();
  const dashboardListUrl = `${dashboardsUrl.replace(/\/$/, "")}/app/dashboards#/list`;

  return (
    <Flex minH="100dvh" bg="#101414" direction="column">
      <Flex
        as="header"
        minH="68px"
        px={{ base: 5, md: 8 }}
        align="center"
        justify="space-between"
        borderBottom="1px solid #313b37"
      >
        <HStack spacing={3}>
          <BrandMark size="38px" />
          <Box>
            <Text fontWeight="750">ComConnect</Text>
            <Text color="#8f9d97" fontSize="xs">OpenSearch analytics</Text>
          </Box>
        </HStack>
        <HStack spacing={2}>
          <Button
            leftIcon={<FiHome />}
            size="sm"
            variant="ghost"
            color="#bdc8c3"
            onClick={() => navigate("/workspace")}
          >
            Workspaces
          </Button>
          <Button
            as="a"
            href={dashboardListUrl}
            target="_blank"
            rel="noreferrer"
            leftIcon={<FiExternalLink />}
            size="sm"
            bg="#22c55e"
            color="#07110c"
            _hover={{ bg: "#4ade80" }}
          >
            Open
          </Button>
        </HStack>
      </Flex>

      <Box px={{ base: 4, md: 6 }} py={5}>
        <Flex align="center" gap={3} mb={4}>
          <Flex
            w="38px"
            h="38px"
            align="center"
            justify="center"
            bg="#26332e"
            color="#6ee7b7"
            borderRadius="6px"
          >
            <FiBarChart2 />
          </Flex>
          <Box>
            <Heading fontSize={{ base: "xl", md: "2xl" }} letterSpacing="0">
              Analytics dashboard
            </Heading>
            <Text color="#9eaaa5" fontSize="sm">
              Login with the OpenSearch admin credentials from your local environment.
            </Text>
          </Box>
        </Flex>

        <Box
          h="calc(100dvh - 160px)"
          minH="520px"
          border="1px solid #313b37"
          borderRadius="8px"
          overflow="hidden"
          bg="#171c1b"
        >
          <Box
            as="iframe"
            title="OpenSearch Dashboards"
            src={dashboardListUrl}
            w="100%"
            h="100%"
            border="0"
          />
        </Box>
      </Box>
    </Flex>
  );
};

export default AnalyticsDashboard;
