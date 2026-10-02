package kr.promotors.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import java.util.Locale;

public class DelegationService extends com.google.androidbrowserhelper.trusted.DelegationService {
    @Override
    public boolean onNotifyNotificationWithChannel(String tag, int id,
            Notification notification, String channelName) {
        Uri sound = Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.precision_check);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Use AndroidX's existing channel ID so user mute/sound choices stay respected.
            String channelId = channelName.toLowerCase(Locale.ROOT).replace(' ', '_') + "_channel_id";
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager.getNotificationChannel(channelId) == null) {
                NotificationChannel channel = new NotificationChannel(channelId, channelName,
                        NotificationManager.IMPORTANCE_DEFAULT);
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
}
