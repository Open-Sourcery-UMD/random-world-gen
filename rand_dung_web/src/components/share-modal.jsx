import { useEffect, useRef, useState } from 'react';
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button";
import { db, auth } from "@/App.jsx";
import { collection, getDocs, getDoc, doc, writeBatch, arrayRemove } from "firebase/firestore";

export function ShareModal({isOpen, onClose, projectId, projectName, children, sendInvite}) {
  const dialogRef = useRef(null);
  const [allowedUsers, setAllowedUsers] = useState([]);
  const [invitedUsers, setInvitedUsers] = useState([]);
  const [usersCollection, setUsersCollection] = useState([]);

  const fetchSharedUsers = async () => {
    if (!projectId) return;
    const projectDoc = await getDoc(doc(db, `projects/${projectId}`));
    const allowedUsers = projectDoc.data()["allowed-users"];
    const invitedUsers = projectDoc.data()["invited-users"];
    const usersCollection = await getDocs(collection(db, `users`));

    setAllowedUsers(allowedUsers);
    setInvitedUsers(invitedUsers);
    setUsersCollection(usersCollection);
  }

  useEffect(() => {
    fetchSharedUsers();
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  const handleBackdropClick = (e) => {
    if (e.target === dialogRef.current) {
      onClose();
    }
  };

  async function checkInvite(email) {
    //check email is valid
    for (const user of usersCollection.docs) {
      if (user.data().email === email && user.id !== auth.currentUser.uid && !allowedUsers.includes(user.id)) {
        sendInvite(projectId, email);
        onClose();
        return;
      }
    }
    alert("Invalid email. Please enter a valid email address of another registered user.");
  }

  async function removeUser(userId) {
    const batch = writeBatch(db);
    batch.update(doc(db, `projects/${projectId}`), {
      "allowed-users": arrayRemove(userId)
    });
    await batch.commit().then(() => {
      fetchSharedUsers();
    });
  }

  async function removeInvite(email) {
    const batch = writeBatch(db);
    batch.update(doc(db, `projects/${projectId}`), {
      "invited-users": arrayRemove(email)
    });
    await batch.commit().then(() => {
      fetchSharedUsers();
    });
  }
  
   function getSharedUsers() {
    return (
      <div>
        {allowedUsers.map((userId) => {
          const user = usersCollection.docs.find((doc) => doc.id === userId);
          return <div key={userId} className="flex flex-row justify-between">
            <h2 className="text-base">
              Allowed User: {user ? user.data().email : "Unknown Allowed User"}
            </h2>
            {
              userId === auth.currentUser.uid ? 
                <span className="text-sm text-gray-500 ml-2 mr-5">(You)</span>
              :
                <Button variant="destructive" size="sm" className="ml-2" onClick={async () => await removeUser(userId)}>Remove</Button>
            }
          </div>;
        })}
        {invitedUsers.map((userEmail) => {
          return <div key={userEmail} className="flex flex-row">
            <h2 className="text-base">
              Invited User: {userEmail}
            </h2>
            <Button variant="destructive" size="sm" className="ml-2" onClick={async () => await removeInvite(userEmail)}>Remove</Button>
          </div>;
        })}
      </div>
    );
  }

  return (
    <dialog ref={dialogRef} onClick={handleBackdropClick} className="fixed left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 p-8 rounded-lg shadow-lg">
        <div className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">{projectName}</h2>
          <Input placeholder="Enter email to invite" className="w-full" />
          {getSharedUsers()}
          <div className="flex flex-col gap-2">
            <Button className="w-full" onClick={() => checkInvite(document.querySelector('input').value)}>Send Invite</Button>
            <Button variant="outline" className="w-full" onClick={() => onClose()}>Close</Button>
          </div>
          {children}
        </div>
    </dialog>
  );
}
