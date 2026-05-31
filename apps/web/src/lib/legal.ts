// Single source of truth for all legal/disclaimer text. Ported from the desktop
// app; the privacy notice is reworded for the self-hosted web deployment (data
// lives in the home-cluster Postgres, not a local SQLite file).

export const APP_NAME = "Homework";
export const REPO_URL = "https://github.com/autumnfallenwang/homework";

export const DISCLAIMER_SHORT =
  "This app is not affiliated with TeacherEase or Common Goal Systems Inc. " +
  "It accesses TeacherEase using credentials you provide for your own parent account.";

export const DISCLAIMER_FULL = `This is an unofficial, community-built tool. It is not affiliated with, endorsed by, or connected to TeacherEase, Common Goal Systems Inc., or any school district.

This software accesses TeacherEase using credentials that you provide for your own parent account. It exercises the same access you have when logging in through a web browser — no additional permissions, no security bypasses, no access to other users' data.

By using this software, you acknowledge that:

• You are the authorized parent/guardian for the TeacherEase account(s) you configure.
• You accept responsibility for your use of this tool in accordance with your school's policies and TeacherEase's Terms of Service.
• The developer provides this software "as is" with no warranty of any kind.
• The developer is not responsible for any consequences of using this software, including but not limited to account restrictions that may be imposed by TeacherEase or your school.`;

export const PRIVACY_NOTICE = `Your data stays on your own infrastructure:

• Portal credentials and grade/homework data are stored in your self-hosted database — never sent to any third party.
• No data is sent anywhere except TeacherEase itself (to check grades) and optionally your own SMTP server (if you enable email reports).
• No telemetry, no analytics, no tracking, no third-party services.`;

export const RESPONSIBLE_USE = `This app is designed to be a respectful, lightweight client:

• Only accesses data for children whose credentials you have provided.
• Does not enumerate other students, classes, or schools.
• Sends an identifiable User-Agent header so TeacherEase can contact the developer if needed.
• Fully open source — the complete source code is available for inspection.`;
