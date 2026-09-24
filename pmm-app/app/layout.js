import "./globals.css";
import { ToastProvider } from "@/components/ToastContext";
import { UserProvider } from "@/components/UserContext";
import PinGate from "@/components/PinGate";
import UserGate from "@/components/UserGate";
import AppShell from "@/components/AppShell";

export const metadata = {
  title: "Production & Material Management",
  description: "Internal operations app for Acheté de Nous",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>
        <ToastProvider>
          <UserProvider>
            <PinGate>
              <UserGate>
                <AppShell>{children}</AppShell>
              </UserGate>
            </PinGate>
          </UserProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
