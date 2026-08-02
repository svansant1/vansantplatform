/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: __dirname,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  async headers() {
    return [
      {
        source: "/downloads/SV-Browser.exe",
        headers: [
          {
            key: "Content-Type",
            value: "application/vnd.microsoft.portable-executable",
          },
          {
            key: "Content-Disposition",
            value: 'attachment; filename="SV-Browser-0.13.4-x64.exe"',
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Cache-Control",
            value: "public, max-age=300, must-revalidate",
          },
        ],
      },
      {
        source: "/downloads/SV-Browser-ARM64.exe",
        headers: [
          {
            key: "Content-Type",
            value: "application/vnd.microsoft.portable-executable",
          },
          {
            key: "Content-Disposition",
            value: 'attachment; filename="SV-Browser-0.13.4-ARM64.exe"',
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Cache-Control",
            value: "public, max-age=300, must-revalidate",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
