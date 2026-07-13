module.exports = {
  apps: [
    {
      name: 'it-helpdesk',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      instances: 1,
      exec_mode: 'fork',
      env: {
        PORT: 3000,
        NODE_ENV: 'production',
        NEXT_PUBLIC_APP_URL: 'https://cloud.mso-hef.de/helpdesk',
        NEXT_PUBLIC_IS_PROD: 'true'
      }
    }
  ]
};
