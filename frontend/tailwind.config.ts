import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        channel: {
          whatsapp: "hsl(var(--channel-whatsapp))",
          email: "hsl(var(--channel-email))",
          teams: "hsl(var(--channel-teams))",
          voice: "hsl(var(--channel-voice))",
          webchat: "hsl(var(--channel-webchat))",
        },
        status: {
          online: "hsl(var(--status-online))",
          away: "hsl(var(--status-away))",
          busy: "hsl(var(--status-busy))",
          offline: "hsl(var(--status-offline))",
          break: "hsl(var(--status-break))",
        },
        priority: {
          high: "hsl(var(--priority-high))",
          medium: "hsl(var(--priority-medium))",
          normal: "hsl(var(--priority-normal))",
          low: "hsl(var(--priority-low))",
        },
        sla: {
          ok: "hsl(var(--sla-ok))",
          warning: "hsl(var(--sla-warning))",
          breach: "hsl(var(--sla-breach))",
        },
        surface: {
          "agent-msg": "hsl(var(--surface-agent-msg))",
          "contact-msg": "hsl(var(--surface-contact-msg))",
          "bot-msg": "hsl(var(--surface-bot-msg))",
          "internal-note": "hsl(var(--surface-internal-note))",
          "system-event": "hsl(var(--surface-system-event))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        "pulse-dot": { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0.5" } },
        "slide-in-right": { from: { transform: "translateX(100%)" }, to: { transform: "translateX(0)" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
        "slide-in-right": "slide-in-right 0.3s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
