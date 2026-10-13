package kr.promotors.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import java.util.Locale;
import java.util.TimeZone;
import java.text.SimpleDateFormat;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class DelegationService extends com.google.androidbrowserhelper.trusted.DelegationService {
    @Override
    public boolean onNotifyNotificationWithChannel(String tag, int id,
            Notification notification, String channelName) {
        // Chromium wraps a developer tag as p[b]#<origin>#1<developer_tag>.
        boolean persistent = tag != null && (tag.startsWith("pm-booking-pending-")
                || tag.matches("^pb?#https://www\\.promotors\\.kr/?#1pm-booking-pending-[A-Za-z0-9_-]{1,128}$"));
        if (persistent) {
            notification.flags |= Notification.FLAG_ONGOING_EVENT | Notification.FLAG_ONLY_ALERT_ONCE;
            notification.flags &= ~Notification.FLAG_AUTO_CANCEL;
            notification.visibility = Notification.VISIBILITY_PRIVATE;
            channelName = "예약 일정";
            countdown(notification);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            CharSequence body = notification.extras.getCharSequence(Notification.EXTRA_TEXT, "");
            if (body.length() > 0) {
                // Recover the original Chromium builder so tap/action PendingIntents stay intact.
                notification = Notification.Builder.recoverBuilder(this, notification)
                        .setStyle(new Notification.BigTextStyle().bigText(body)).build();
            }
        }
        Uri sound = persistent ? null : Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.precision_check);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Use AndroidX's existing channel ID so user mute/sound choices stay respected.
            String channelId = channelName.toLowerCase(Locale.ROOT).replace(' ', '_') + "_channel_id";
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager.getNotificationChannel(channelId) == null) {
                NotificationChannel channel = new NotificationChannel(channelId, channelName,
                        persistent ? NotificationManager.IMPORTANCE_LOW : NotificationManager.IMPORTANCE_DEFAULT);
                AudioAttributes audio = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
                channel.setSound(sound, audio);
                manager.createNotificationChannel(channel);
            }
        } else {
            notification.sound = sound;
            notification.defaults &= ~Notification.DEFAULT_SOUND;
        }
        return super.onNotifyNotificationWithChannel(tag, id, notification, channelName);
    }
    private void countdown(Notification notification) {
        Matcher time = Pattern.compile("\\d{4}\\.\\d{2}\\.\\d{2}\\s*·\\s*\\d{2}:\\d{2}")
                .matcher(String.valueOf(notification.extras.getCharSequence(Notification.EXTRA_TEXT, "")));
        if (!time.find()) return;
        SimpleDateFormat format = new SimpleDateFormat("yyyy.MM.dd HH:mm", Locale.KOREA);
        format.setTimeZone(TimeZone.getTimeZone("Asia/Seoul"));
        format.setLenient(false);
        try {
            long startsAt = format.parse(time.group().replaceAll("\\s*·\\s*", " ")).getTime();
            if (startsAt <= System.currentTimeMillis()) return;
            notification.when = startsAt;
            notification.extras.putBoolean(Notification.EXTRA_SHOW_WHEN, true);
            notification.extras.putBoolean(Notification.EXTRA_SHOW_CHRONOMETER, true);
            notification.extras.putBoolean(Notification.EXTRA_CHRONOMETER_COUNT_DOWN, true);
        } catch (java.text.ParseException ignored) {
            // Keep the schedule text when a malformed timestamp cannot be counted down.
        }
    }
}
