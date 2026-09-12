import './global.css';

import '@aether-zone/kosmos/styles.css';

export const metadata = {
  title: 'Welcome to web',
  description: 'OAuth 2.0 authorization server',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
