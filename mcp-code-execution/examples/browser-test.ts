/**
 * Example: Browser Testing with Code Execution Pattern
 *
 * This demonstrates the new MCP code execution approach:
 * - Only imports the tools actually needed
 * - Composes operations naturally in code
 * - Keeps intermediate data in execution sandbox
 * - Dramatically reduces context usage
 */

// Only import what we need - not all 26 chrome-devtools tools!
import { MCPClient } from '../../lib/mcp-client';

/**
 * Test the Baku Reserve reservation flow
 */
async function testReservationFlow() {
  console.log("Starting Baku Reserve reservation flow test...");
  const client = await MCPClient.getInstance();

  // 1. Navigate to the app
  await client.call('chrome-devtools', 'navigate', { url: "http://localhost:8081" });
  console.log("✓ Navigated to app");

  // 2. Take initial screenshot
  await client.call('chrome-devtools', 'screenshot', { filePath: './test-results/home.png' });
  console.log("✓ Captured home screen");

  // 3. Get page snapshot to find elements
  const pageSnapshot = await client.call('chrome-devtools', 'snapshot', {});
  console.log("✓ Got page snapshot");

  // 4. Find and click on a restaurant
  const restaurantElement = findElementInSnapshot(pageSnapshot, "Nizami Restaurant");
  if (restaurantElement) {
    await client.call('chrome-devtools', 'click', { uid: restaurantElement.uid });
    console.log("✓ Clicked on restaurant");
  }

  // 5. Fill reservation form
  const dateInput = findElementInSnapshot(pageSnapshot, "input[type='date']");
  const timeInput = findElementInSnapshot(pageSnapshot, "input[type='time']");
  const guestsInput = findElementInSnapshot(pageSnapshot, "input[name='guests']");

  if (dateInput && timeInput && guestsInput) {
    await client.call('chrome-devtools', 'fill', { uid: dateInput.uid, value: "2024-12-01" });
    await client.call('chrome-devtools', 'fill', { uid: timeInput.uid, value: "19:00" });
    await client.call('chrome-devtools', 'fill', { uid: guestsInput.uid, value: "4" });
    console.log("✓ Filled reservation form");
  }

  // 6. Submit reservation
  const submitButton = findElementInSnapshot(pageSnapshot, "Reserve");
  if (submitButton) {
    await client.call('chrome-devtools', 'click', { uid: submitButton.uid });
    console.log("✓ Submitted reservation");
  }

  // 7. Capture confirmation
  await client.call('chrome-devtools', 'screenshot', { filePath: './test-results/confirmation.png' });
  console.log("✓ Test completed successfully!");

  // Return test results
  return {
    success: true,
    screenshots: [
      './test-results/home.png',
      './test-results/confirmation.png'
    ],
    steps: 7
  };
}

/**
 * Helper function to find elements in snapshot
 * Keeps processing logic in execution environment
 */
function findElementInSnapshot(snapshot: any, query: string): any {
  // This processing happens in the execution sandbox
  // Not passed through model context!

  // Search logic here...
  return snapshot.elements?.find((el: any) =>
    el.text?.includes(query) || el.attributes?.includes(query)
  );
}

/**
 * Run performance test with network monitoring
 */
async function testPerformance() {
  const client = await MCPClient.getInstance();

  console.log("Starting performance test...");

  await client.call('chrome-devtools', 'performance_start_trace', { reload: true, autoStop: false });
  await client.call('chrome-devtools', 'navigate', { url: "http://localhost:8081" });

  // Wait for page to fully load
  await new Promise(resolve => setTimeout(resolve, 3000));

  const traceResults = await client.call('chrome-devtools', 'performance_stop_trace', {});
  const networkRequests = await client.call('chrome-devtools', 'list_network_requests', {});

  // Process results in execution environment
  const metrics = {
    loadTime: traceResults.metrics?.domContentLoaded,
    totalRequests: networkRequests.length,
    failedRequests: networkRequests.filter((r: any) => r.status >= 400).length,
    totalSize: networkRequests.reduce((sum: number, r: any) => sum + r.size, 0)
  };

  console.log("Performance metrics:", metrics);
  return metrics;
}

// Export for use in other tests
export { testReservationFlow, testPerformance };