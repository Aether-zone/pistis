/* eslint-disable */

/**
 * Stops the process global setup started, by pid.
 *
 * Deliberately not `killPort`: that stops whatever holds the port, which on a
 * developer's machine is as likely to be a server they are using as the one
 * this suite started.
 */
module.exports = async function () {
  const pid = globalThis.__API_PID__ as number | undefined;

  if (pid) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Already gone.
    }
  }

  console.log(globalThis.__TEARDOWN_MESSAGE__);
};
