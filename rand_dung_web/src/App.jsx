import { initializeApp } from 'firebase/app';
import { getAnalytics } from "firebase/analytics";
import { initializeUI } from '@firebase-oss/ui-core';
import { FirebaseUIProvider } from '@firebase-oss/ui-react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Home } from "@/pages/home";
import { Login } from "@/pages/login";
import { SignUp } from "@/pages/signup";
import { Dashboard } from "@/pages/dashboard";
import { VerifyEmail } from "@/pages/verify-email";
import { Settings } from "@/pages/settings";
import { CreateProject } from "@/pages/create-project";
import { EditProject } from "@/pages/edit-project";
import { GenerationSettings } from "@/pages/gen-settings";
import { useEffect, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { VerifiedMenuItems, UnverifiedMenuItems, VerifyEmailItems } from "@/components/menu-items";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
} from "@/components/ui/navigation-menu";
import { RequireVerifiedUser } from "@/components/require-verified-user";
import { getFirestore } from "firebase/firestore";
import { Navigate } from "react-router-dom";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAXRcZ3uZDafBuBelgDy1H94EEoHF2mPkE",
  authDomain: "random-worlds.firebaseapp.com",
  projectId: "random-worlds",
  storageBucket: "random-worlds.firebasestorage.app",
  messagingSenderId: "366846270513",
  appId: "1:366846270513:web:bc99f6d55b4f2749698910",
  measurementId: "G-NW43XWJVR9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getFirestore(app);

const ui = initializeUI({
  app,
});

export function AppProviders({ children }) {
  return <FirebaseUIProvider ui={ui}>{children}</FirebaseUIProvider>;
}

function App() {
  const [user, setUser] = useState(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setEmailVerified(!!currentUser?.emailVerified);
      setAuthLoading(false);
    });
  }, []);

  return (
    <AppProviders>
        <Router basename={import.meta.env.BASE_URL}>
          <header className="w-full bg-slate-900 text-white">
            <nav className="mx-auto flex items-center justify-between py-4 px-6">
              <Link to="/" className="text-xl font-bold tracking-tight">
                Random Worlds
              </Link>

              <div className="flex items-center gap-3">
                {emailVerified && (
                  <Link
                    to="/dashboard"
                    className="inline-flex h-9 w-max items-center justify-center rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all outline-none hover:bg-white/10 focus:bg-white/10 focus-visible:ring-3 focus-visible:ring-white/50"
                  >
                    Dashboard
                  </Link>
                )}
                <NavigationMenu>
                  <NavigationMenuList>
                    <NavigationMenuItem>
                      <NavigationMenuTrigger>Account</NavigationMenuTrigger>
                      <NavigationMenuContent>
                        <div className="flex min-w-36 flex-col gap-1 p-2">
                          {emailVerified ? <VerifiedMenuItems /> : user ? <VerifyEmailItems /> : <UnverifiedMenuItems />}
                        </div>
                      </NavigationMenuContent>
                    </NavigationMenuItem>
                  </NavigationMenuList>
                </NavigationMenu>
              </div>
            </nav>
          </header>

          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={
              <RequireVerifiedUser user={user} authLoading={authLoading} >
                <Dashboard />
              </RequireVerifiedUser>
            } />
            <Route path="/verify-email" element={<VerifyEmail user={user} authLoading={authLoading} onVerified={() => setEmailVerified(true)} />} />
            <Route path="/settings" element={
              (user ? <Settings /> : <Navigate to="/login" replace />)
            } />
            <Route path="/create-project" element={
              <RequireVerifiedUser user={user} authLoading={authLoading} >
                <CreateProject />
              </RequireVerifiedUser>
            } />
            <Route path="/edit" element={<EditProject user={user} authLoading={authLoading} />} />
            <Route path="/gen-settings" element={<GenerationSettings user={user} authLoading={authLoading} />} />
          </Routes>
        </Router> 
    </AppProviders>
  )
}

export default App;
