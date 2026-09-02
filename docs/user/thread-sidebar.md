# Organizing threads

Pin a thread from its context menu to keep it in the pinned section above your active work.
`mod+shift+p` pins or unpins the thread you have open. Pinned threads are shown independently of
their project, including when you connect to more than one environment.

To require confirmation before unpinning, enable **Settings → General → Unpin confirmation**. The
confirmation applies to the sidebar controls, thread menus, and the `mod+shift+p` shortcut.

Pinned threads still move to **Settled** when they become inactive. They also move when their pull
request merges if **Auto-settle merged threads** is enabled.

Each server stores its own copy of the automatic settlement settings and checks them even when no
web, desktop, or mobile client is connected. By default, it settles threads after three days without
activity and when their pull request merges. An eligible idle thread also settles when its pull
request closes. An open pull request blocks inactivity settlement. Active work, pending input, and
live background work keep the thread active. T3 Code settles from a closed or merged pull request
only when its timestamp is not older than the user's latest activity. If that timestamp is not
available, the inactivity rule still applies. A manual un-settle also keeps the thread active.

Change these rules in **Settings > General**. The change is written to every environment you are
connected to at that moment. An environment that is offline keeps its old value. When a connected
environment holds a different value, **Settings > General** shows a warning that names it. Choose
**Apply to all** to write your current values to every connected environment. The same applies to
the new-thread workspace mode and the source control writing style.

A settings change affects future settlement and does not reopen a settled thread. Settings saved
by older clients on one device no longer control this behavior.

When you un-settle a thread, it returns to the top of the active list so you can find it right
away. Its timestamps do not change. Other threads keep their positions.

Right-click a pull request link in a thread and choose **Link to thread** to show that pull request
in the sidebar. The thread settles when the linked pull request merges if **Auto-settle merged
threads** is enabled. Right-click the same link and choose **Unlink from thread** to remove it.

On web and desktop, drag a pinned thread to change its position. On mobile, open the thread's menu
and choose **Move up** or **Move down**. The order is stored by the server and appears on your
other connected devices.

If reordering is unavailable for one environment, update the T3 Code server running in that
environment. Older servers can still pin and unpin threads, but do not understand synced ordering;
their pinned threads keep the default newest-first order below the ones you have arranged.

## Quick switching on mobile

While a thread is open on a phone-sized iOS or Android screen, a movable chat bubble appears when
another chat is running or needs your attention — a pending approval, an input request, or work
that finished while you were elsewhere. Chats you start on other devices count too: kick off a
task from the desktop app and the bubble surfaces it on your phone while it runs. Drag the bubble
anywhere while you work; when you release it, it follows your push and settles against the left or
right side. Press it to open the **Recent activity** menu. Choosing a chat switches to it without
stopping any work running in the other chats.

The menu lists chats with something happening — up to five. Rows show **Approval**, **Input**, or
**Done** when a chat needs you, and **Working** or **Monitoring** while another agent is still
active; chats with nothing going on stay out of the menu. The number on the bubble counts only the
chats that need you — working and monitoring chats do not increase it. Opening the menu leaves
these indicators intact; opening a specific chat marks its attention as seen on that device. Once
nothing is running and nothing needs you, the bubble goes away until the next chat wants your
attention.

To put the bubble away, drag it toward the bottom of the screen: an **X** appears, pulls the
bubble in when you get close, and dropping it there dismisses it. Dismissing marks everything
currently shown as seen and quiets the chats that are still running — anything new, like a fresh
approval request, a chat finishing, or a newly started chat, brings the bubble back. Screen-reader
users can pick the **Dismiss until new activity** action on the bubble instead.

The menu excludes the thread already open. Recent threads and the bubble position are stored only
on that mobile device; they do not sync through a T3 environment. The bubble also stays hidden on
the chat list, the new-task screen, and split layouts where the thread sidebar is already visible.

## Environment artwork

Dev and Nightly environments can identify themselves with artwork at the top of the sidebar and in
the send button. Choose **Artwork**, **Version pill**, or **None** in Settings under environment
identification. Artwork is recolored to match each built-in theme. Custom themes use the **Version
pill** fallback because their colors are not controlled by T3 Code.

To generate a fresh title from the conversation, open a thread's context menu and choose
**Regenerate title**. While T3 Code is generating it, the action reads **Regenerating…** and cannot
be selected again. The option is hidden when the connected environment needs a server update.
