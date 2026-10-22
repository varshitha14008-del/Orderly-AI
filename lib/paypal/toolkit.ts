/**
 * Wrapper for official @paypal/agent-toolkit
 * Enables AI agents to call PayPal tools (Orders, Disputes, Refunds)
 */

import { PayPalAgentToolkit, ALL_TOOLS_ENABLED } from "@paypal/agent-toolkit/ai-sdk";
import { getPayPalCredentials } from "./auth";

let toolkitInstance: PayPalAgentToolkit | null = null;

export function getPayPalAgentToolkit(): PayPalAgentToolkit {
  if (toolkitInstance) {
    return toolkitInstance;
  }

  const { clientId, clientSecret } = getPayPalCredentials();

  toolkitInstance = new PayPalAgentToolkit({
    clientId,
    clientSecret,
    configuration: {
      actions: ALL_TOOLS_ENABLED,
      context: {
        sandbox: (process.env.PAYPAL_ENV || "sandbox") === "sandbox",
        debug: false,
      },
    },
  });

  return toolkitInstance;
}

/**
 * Returns available AI tools from PayPal Agent Toolkit
 */
export function getAvailablePayPalTools(): Record<string, any> {
  const toolkit = getPayPalAgentToolkit();
  return toolkit.getTools();
}
