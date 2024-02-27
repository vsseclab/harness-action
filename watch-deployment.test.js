const { watchDeployment } = require("./watch-deployment.js");

const axios = require("axios");
const MockAdapter = require("axios-mock-adapter");
const { mockProcessStdout } = require("jest-mock-process");

const mockHarnessApiUrl = "http://harness.com/deployment-api-endpoint";
const mockHarnessUiUrl = "http://harness.com/watch-deployment";
var capturedStdout;

// reset the captured calls before each test
beforeEach(async () => {
  capturedStdout = mockProcessStdout();
});

describe("watchDeployment", () => {
  test("polling on a successful deployment", () => {
    expect.assertions(1);

    const http_mock = new MockAdapter(axios);
    http_mock
      .onGet(mockHarnessApiUrl)
      .replyOnce(200, {
        status: "RUNNING",
      })
      .onGet(mockHarnessApiUrl)
      .replyOnce(200, {
        status: "RUNNING",
      })
      .onGet(mockHarnessApiUrl)
      .replyOnce(200, {
        status: "SUCCESS",
      });

    return watchDeployment(
      mockHarnessApiUrl,
      mockHarnessUiUrl,
      "HARNESS_TEST_API_KEY",
      {
        waitBetween: 0.1,
      }
    ).then((result) => {
      expect(result).toBe("🎉 Deployment succeeded");
    });
  });

  test("polling ends when deployment failed", () => {
    expect.assertions(1);

    const http_mock = new MockAdapter(axios);
    http_mock
      .onGet(mockHarnessApiUrl)
      .replyOnce(200, {
        status: "RUNNING",
      })
      .onGet(mockHarnessApiUrl)
      .replyOnce(200, {
        status: "FAILED",
      });
    return expect(
      watchDeployment(
        mockHarnessApiUrl,
        mockHarnessUiUrl,
        "HARNESS_TEST_API_KEY",
        {
          waitBetween: 0.1,
        }
      )
    ).rejects.toMatchObject({
      error: "FAILED",
      message: expect.stringContaining("Deployment has failed"),
    });
  });

  test("polling ends when deployment aborted", () => {
    expect.assertions(1);

    const http_mock = new MockAdapter(axios);
    http_mock
      .onGet(mockHarnessApiUrl)
      .replyOnce(200, {
        status: "RUNNING",
      })
      .onGet(mockHarnessApiUrl)
      .replyOnce(200, {
        status: "ABORTED",
      });

    return expect(
      watchDeployment(
        mockHarnessApiUrl,
        mockHarnessUiUrl,
        "HARNESS_TEST_API_KEY",
        {
          waitBetween: 0.1,
        }
      )
    ).rejects.toMatchObject({
      error: "ABORTED",
      message: expect.stringContaining("Deployment was aborted"),
    });
  });

  test("polling ends when deployment rejected", () => {
    expect.assertions(1);

    const http_mock = new MockAdapter(axios);
    http_mock
      .onGet(mockHarnessApiUrl)
      .replyOnce(200, {
        status: "RUNNING",
      })
      .onGet(mockHarnessApiUrl)
      .replyOnce(200, {
        status: "REJECTED",
      });

    return expect(
      watchDeployment(
        mockHarnessApiUrl,
        mockHarnessUiUrl,
        "HARNESS_TEST_API_KEY",
        {
          waitBetween: 0.1,
        }
      )
    ).rejects.toMatchObject({
      error: "REJECTED",
      message: expect.stringContaining("Deployment was rejected"),
    });
  });

  test("polling ends when status is unknown", () => {
    expect.assertions(1);

    const http_mock = new MockAdapter(axios);
    http_mock
      .onGet(mockHarnessApiUrl)
      .replyOnce(200, {
        status: "RUNNING",
      })
      .onGet(mockHarnessApiUrl)
      .replyOnce(200, {
        status: "UH OH",
      });

    return expect(
      watchDeployment(
        mockHarnessApiUrl,
        mockHarnessUiUrl,
        "HARNESS_TEST_API_KEY",
        {
          waitBetween: 0.1,
        }
      )
    ).rejects.toMatchObject({
      error: "UH OH",
      message: expect.stringContaining("Unknown status from Harness: UH OH."),
    });
  });

  test("polling ends when unexpected HTTP status in response", () => {
    expect.assertions(1);

    const http_mock = new MockAdapter(axios);
    http_mock
      .onGet(mockHarnessApiUrl)
      .replyOnce(200, {
        status: "QUEUED",
      })
      .onGet(mockHarnessApiUrl)
      .replyOnce(201, {
        status: "RUNNING",
      });

    return expect(
      watchDeployment(
        mockHarnessApiUrl,
        mockHarnessUiUrl,
        "HARNESS_TEST_API_KEY",
        {
          waitBetween: 0.1,
        }
      )
    ).rejects.toMatchObject({
      error: undefined,
      message: expect.stringContaining(
        "failed with status code 201"
      ),
    });
  });

  test("polling retries on known HTTP error status (408)", () => {
    expect.assertions(1);

    const http_mock = new MockAdapter(axios);
    http_mock
      .onGet(mockHarnessApiUrl)
      .replyOnce(200, {
        status: "RUNNING",
      })
      .onGet(mockHarnessApiUrl)
      .replyOnce(408, {
        status: "KNOWN_HTTP_STATUS_CODE",
      })
      .onGet(mockHarnessApiUrl)
      .replyOnce(200, {
        status: "SUCCESS",
      });

    return watchDeployment(
      mockHarnessApiUrl,
      mockHarnessUiUrl,
      "HARNESS_TEST_API_KEY",
      {
        waitBetween: 0.1,
      }
    ).then((result) => {
      expect(result).toBe("🎉 Deployment succeeded");
    });
  });

  test("doesn't print multiple errors when polling fails", () => {
    expect.assertions(1);

    const http_mock = new MockAdapter(axios);
    http_mock
      .onGet(mockHarnessApiUrl)
      .replyOnce(200, {
        status: "RUNNING",
      })
      .onGet(mockHarnessApiUrl)
      .replyOnce(200, {
        status: "RUNNING",
      })
      .onGet(mockHarnessApiUrl)
      .replyOnce(200, {
        status: "FAILED",
      });

    return watchDeployment(
      mockHarnessApiUrl,
      mockHarnessUiUrl,
      "HARNESS_TEST_API_KEY",
      {
        waitBetween: 0.1,
      }
    ).catch(() => {
      const failure_messages = capturedStdout.mock.calls.filter(([msg, ...rest]) =>
        msg == "polling response error:\n"
      );
      expect(failure_messages).toHaveLength(1);
    });
  });

  test("retries when Harness times out", () => {
    const http_mock = new MockAdapter(axios);
    http_mock
      .onGet(mockHarnessApiUrl)
      .replyOnce(200, {
        status: "RUNNING",
      })
      .onGet(mockHarnessApiUrl)
      .timeoutOnce()
      .onGet(mockHarnessApiUrl)
      .replyOnce(200, {
        status: "SUCCESS",
      });

    return watchDeployment(
      mockHarnessApiUrl,
      mockHarnessUiUrl,
      "HARNESS_TEST_API_KEY",
      {
        waitBetween: 0.1,
      }
    );
  });
});
