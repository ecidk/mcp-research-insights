import { logger } from "../utils/logger.js";

export async function exampleTool(args: any, scopes: string[]) {
  logger.info("Executing example_tool", { param1: args.param1 });

  // Example implementation - replace with your actual logic
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        message: "Example tool executed successfully",
        param1: args.param1,
        timestamp: new Date().toISOString()
      }, null, 2)
    }]
  };
}
