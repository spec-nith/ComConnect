import { extendTheme } from "@chakra-ui/react";

const theme = extendTheme({
  fonts: {
    heading: "Inter, ui-sans-serif, system-ui, sans-serif",
    body: "Inter, ui-sans-serif, system-ui, sans-serif",
    head: "Inter, ui-sans-serif, system-ui, sans-serif",
    subhead: "Inter, ui-sans-serif, system-ui, sans-serif",
    content: "Inter, ui-sans-serif, system-ui, sans-serif",
  },
  colors: {
    brand: {
      50: "#eafbf4",
      100: "#c8f3e2",
      400: "#34d399",
      500: "#10b981",
      600: "#059669",
      700: "#047857",
    },
    ink: {
      900: "#101414",
      800: "#171c1b",
      700: "#202725",
      600: "#2c3532",
    },
  },
  radii: {
    md: "6px",
    lg: "8px",
    xl: "8px",
    "2xl": "8px",
  },
  styles: {
    global: {
      "html, body, #root": {
        minHeight: "100%",
        background: "#101414",
        color: "#eef4f1",
      },
      body: { letterSpacing: "0" },
      "*::selection": {
        background: "#10b981",
        color: "#07120e",
      },
    },
  },
  components: {
    Button: {
      baseStyle: {
        borderRadius: "6px",
        fontWeight: "600",
      },
    },
    Input: {
      defaultProps: { focusBorderColor: "brand.400" },
    },
    Textarea: {
      defaultProps: { focusBorderColor: "brand.400" },
    },
  },
});

export default theme;
