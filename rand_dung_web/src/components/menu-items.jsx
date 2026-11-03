import { Link } from 'react-router-dom';
import { auth } from "@/App.jsx";
import { signOut } from "firebase/auth";

function Logout() {
    return (
        <Link className="block rounded px-3 py-2 hover:bg-slate-100" to="/login" onClick={() => signOut(auth)}>
            Logout
        </Link>
    )
}

function Settings() {
    return (
        <Link className="block rounded px-3 py-2 hover:bg-slate-100" to="/settings">
            Settings
        </Link>
    )
}

export function VerifiedMenuItems() {
    return (
        <>
            <Settings />
            <Logout />
        </>
    );
}

export function VerifyEmailItems() {
    return (
        <>
            <Link className="block rounded px-3 py-2 hover:bg-slate-100" to="/verify-email">
                Verify Email
            </Link>
            <Settings />
            <Logout />
        </>
    );
}

export function UnverifiedMenuItems() {
    return (
        <>
            <Link className="block rounded px-3 py-2 hover:bg-slate-100" to="/login">
                Login
            </Link>
            <Link className="block rounded px-3 py-2 hover:bg-slate-100" to="/signup">
                Sign Up
            </Link>
        </>
    );
}
