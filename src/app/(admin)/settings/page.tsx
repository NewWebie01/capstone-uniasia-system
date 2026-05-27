"use client";

import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Settings, Lock, User } from "lucide-react"; // Icons from lucide-react

const settingsData = [
  {
    id: "1",
    title: "Account Settings",
    description: "Manage your account information and preferences.",
    icon: <User className="text-blue-500" />,
    href: "/settings/account",
  },
  {
    id: "2",
    title: "Security Settings",
    description: "Update your password and manage two-factor authentication.",
    icon: <Lock className="text-red-500" />,
    href: "/settings/security",
  },
  {
    id: "3",
    title: "General Settings",
    description:
      "Change application settings like language, theme, and notifications.",
    icon: <Settings className="text-green-500" />,
    href: "/settings/general",
  },
];

const SettingsPage = () => {
  return (
    <motion.div
      className="p-6"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: 0.15,
          },
        },
      }}
    >
      {/* Header */}
      <motion.h1
        className="text-3xl font-bold mb-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        Settings
      </motion.h1>

      {/* Settings Options Cards */}
      <motion.div
        className="grid gap-6 md:grid-cols-2 xl:grid-cols-3"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: {
            transition: {
              staggerChildren: 0.15,
            },
          },
        }}
      >
        {settingsData.map((setting) => (
          <motion.div
            key={setting.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <Card className="border-muted hover:bg-gray-100 transition-all duration-200 cursor-pointer">
              <CardHeader className="flex items-center justify-between">
                <CardTitle className="text-base">{setting.title}</CardTitle>
                {setting.icon}
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <div>{setting.description}</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
};

export default SettingsPage;
