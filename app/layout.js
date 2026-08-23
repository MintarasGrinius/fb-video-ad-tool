import "./globals.css";

export const metadata = {
  title: "FB Video Ad Maker",
  description: "Generate a Facebook video ad from two keyframe prompts via fal.ai",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
