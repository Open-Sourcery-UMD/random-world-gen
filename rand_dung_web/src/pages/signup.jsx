import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { SignUpAuthForm } from "@/components/sign-up-auth-form";
import { useNavigate } from "react-router-dom";
import { sendEmailVerification } from "firebase/auth";
import {writeBatch, doc} from "firebase/firestore";
import { db, auth } from "@/App.jsx";

export function SignUp() {
    const navigate = useNavigate();

    async function handleNewAcc(credential) {
        const user = credential?.user ?? credential;

        const batch = writeBatch(db);
        batch.set(doc(db, `users/${user.uid}`), {
            email: user.email,
        }).commit();
        

        if (!user?.emailVerified) {
            try {
                await sendEmailVerification(user);
                navigate("/verify-email");
            } catch {
                alert("Error sending verification email. Please try again.");
            }

            return;
        }

        navigate("/dashboard");
    }

    return (
        <div className="w-full flex flex-col items-center justify-center gap-10 pt-10">
            <div className="w-100">
                <SignUpAuthForm onSignUp={handleNewAcc} />
            </div>

            <h4>or</h4>

            <div className="w-100">
                <GoogleSignInButton onSignIn={handleNewAcc} />
            </div>
        </div>
    )
}
