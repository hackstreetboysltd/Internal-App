import dynamic from "next/dynamic";
import ProfileFallback from "./ProfileFallback";
import "./profile.css";

const ProfileClient = dynamic(() => import("./ProfileClient"), {
    loading: () => <ProfileFallback />,
});

export default function ProfilePage() {
    return <ProfileClient />;
}
