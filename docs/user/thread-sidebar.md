# Organizing threads

Pin a thread from its context menu to keep it in the pinned section above your active work.
Pinned threads are shown independently of their project, including when you connect to more than
one environment.

On web and desktop, drag a pinned thread to change its position. On mobile, open the thread's menu
and choose **Move up** or **Move down**. The order is stored by the server and appears on your
other connected devices.

If reordering is unavailable for one environment, update the T3 Code server running in that
environment. Older servers can still pin and unpin threads, but do not understand synced ordering;
their pinned threads keep the default newest-first order below the ones you have arranged.

## Quick switching on mobile

While a thread is open on a phone-sized iOS or Android screen, a movable chat bubble keeps up to
five recently left threads within reach. Drag it anywhere while you work; when you release it, the
bubble follows your push and settles against the left or right side. Press it to open the
recent-thread menu. Choosing a thread switches to it without stopping any work running in the other
threads.

The number on the bubble counts recent chats with unseen work that needs attention, not every chat
in the menu. Rows show **Approval**, **Input**, or **Done** when a chat needs you, and **Working** or
**Monitoring** while another agent is still active. Working and monitoring chats do not increase
the number. Opening the menu leaves these indicators intact; opening a specific chat marks its
attention as seen on that device.

The menu excludes the thread already open. Recent threads and the bubble position are stored only
on that mobile device; they do not sync through a T3 environment. The bubble is hidden on the chat
list, the new-task screen, and split layouts where the thread sidebar is already visible.

## Environment artwork

Dev and Nightly environments can identify themselves with artwork at the top of the sidebar and in
the send button. Choose **Artwork**, **Version pill**, or **None** in Settings under environment
identification. Artwork is recolored to match each built-in theme. Custom themes use the **Version
pill** fallback because their colors are not controlled by T3 Code.

To generate a fresh title from the conversation, open a thread's context menu and choose
**Regenerate title**. While T3 Code is generating it, the action reads **Regenerating…** and cannot
be selected again. The option is hidden when the connected environment needs a server update.
