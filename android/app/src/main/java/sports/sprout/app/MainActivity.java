package sports.sprout.app;

import com.getcapacitor.BridgeActivity;
import sports.sprout.app.TranscodePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(TranscodePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
