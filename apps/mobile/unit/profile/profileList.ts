import { PROFILESETTING, HELP, MESSAGE, LOGOUT, LIST } from "@/assets/icons";
import { router } from "expo-router";

/**
 * @param onLogout  Logout handler.
 * @param isSeller  Whether the user is in selling mode. "Viewing Hours" is
 *   seller-only: the backend's get-schedule/me is agent-scoped, and buyers
 *   have no availability of their own to publish.
 */
export const getProfileList = (onLogout: () => void, isSeller = false) => [
  {
    id: 1,
    icon: PROFILESETTING,
    title: "Settings",
    chevronRight: true,
    onClick: () => {
      router.push("/profile-setting");
    },
  },
  ...(isSeller
    ? [
      {
        id: 5,
        icon: LIST,
        title: "Viewing Hours",
        chevronRight: true,
        onClick: () => {
          router.push("/availability");
        },
      },
    ]
    : []),
  {
    id: 2,
    icon: HELP,
    title: "Help",
    chevronRight: true,
    onClick: () => {
      router.push("/support");
    },
  },
  {
    id: 3,
    icon: MESSAGE,
    title: "Feedback",
    chevronRight: true,
    onClick: () => {
      console.log("feedback clicked");
      router.push("/support-feedback");
    },
  },
  {
    id: 4,
    icon: LOGOUT,
    title: "Logout",
    chevronRight: false,
    onClick: onLogout,
  },
];
