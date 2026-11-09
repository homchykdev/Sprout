package sports.sprout.app

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.C
import androidx.media3.common.MimeTypes
import androidx.media3.common.ProgressHolder
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.FrameDropEffect
import androidx.media3.effect.Presentation
import androidx.media3.effect.ScaleAndRotateTransformation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import androidx.media3.transformer.VideoEncoderSettings
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

@UnstableApi
@CapacitorPlugin(
    name = "Media3Transcode",
    permissions = [
        Permission(alias = "media", strings = ["android.permission.READ_MEDIA_VIDEO"])
    ]
)
class TranscodePlugin : Plugin() {

    private val executor: ExecutorService = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
    private var currentTransformer: Transformer? = null
    private var progressTimer: java.util.Timer? = null
    private var activeCall: PluginCall? = null

    override fun onDestroy() {
        super.onDestroy()
        executor.shutdown()
        progressTimer?.cancel()
        currentTransformer?.cancel()
    }

    @PluginMethod
    fun convert(call: PluginCall) {
        val inputBase64 = call.getString("inputBase64") ?: return call.reject("inputBase64 required")
        val outName = call.getString("outName") ?: "out.mp4"
        val height = call.getInt("height") ?: 1080
        val fps = call.getInt("fps") ?: 60
        val codec = call.getString("codec") ?: "hevc" // "av1" | "hevc" | "avc"
        val bitrate = call.getInt("bitrate") ?: 4_000_000

        // Decode base64 to a temp file
        executor.execute {
            try {
                val bytes = android.util.Base64.decode(inputBase64, android.util.Base64.DEFAULT)
                val inFile = File(cacheDir, "transcode_in_${System.currentTimeMillis()}.mp4")
                FileOutputStream(inFile).use { it.write(bytes) }
                val outFile = File(cacheDir, outName)

                // Pick video mime
                val videoMime = when (codec.lowercase()) {
                    "av1" -> MimeTypes.VIDEO_AV1
                    "hevc" -> MimeTypes.VIDEO_H265
                    else -> MimeTypes.VIDEO_H264
                }

                // Build Transformer with encoder settings and effects
                val encoderSettings = VideoEncoderSettings.DEFAULT.buildUpon()
                    .setBitrate(bitrate)
                    .setBitrateMode(android.media.MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_VBR)
                    .build()

                val effects = mutableListOf<Any>()

                // Scale to target height, keeping aspect ratio
                effects.add(Presentation.createForHeight(height))

                // Fps cap if requested (Transformer.setFrameRate is a max for video)
                if (fps > 0) {
                    effects.add(FrameDropEffect.createDefaultFrameDropEffect(fps.toFloat()))
                }

                val edited = EditedMediaItem.Builder(MediaItem.fromUri(Uri.fromFile(inFile)))
                    .setEffects(effects)
                    .build()

                val transformer = Transformer.Builder(activity)
                    .setVideoMimeType(videoMime)
                    .setAudioMimeType(MimeTypes.AUDIO_AAC)
                    .setEncoderFactory(
                        androidx.media3.transformer.DefaultEncoderFactory.Builder(activity)
                            .setRequestedVideoEncoderSettings(encoderSettings)
                            .setEnableFallback(true) // fall back to supported encoder
                            .build()
                    )
                    .addListener(object : Transformer.Listener {
                        override fun onCompleted(composition: Composition, result: ExportResult) {
                            mainHandler.post {
                                handleSuccess(call, outFile)
                            }
                        }

                        override fun onError(
                            composition: Composition,
                            result: ExportResult,
                            exception: androidx.media3.transformer.ExportException
                        ) {
                            mainHandler.post {
                                handleError(call, exception)
                            }
                        }
                    })
                    .build()

                currentTransformer = transformer
                startProgressPolling(call, transformer)
                transformer.start(edited, outFile.absolutePath)

            } catch (e: Exception) {
                mainHandler.post { call.reject("setup failed", e) }
            }
        }
    }

    @PluginMethod
    fun cancel(call: PluginCall) {
        progressTimer?.cancel()
        progressTimer = null
        currentTransformer?.cancel()
        currentTransformer = null
        call.resolve()
    }

    private fun startProgressPolling(call: PluginCall, transformer: Transformer) {
        progressTimer?.cancel()
        progressTimer = java.util.Timer()
        progressTimer!!.schedule(object : java.util.TimerTask() {
            override fun run() {
                mainHandler.post {
                    val holder = ProgressHolder()
                    val state = transformer.getProgress(holder)
                    if (state != Transformer.PROGRESS_STATE_NOT_STARTED) {
                        val pct = holder.progressPercent
                        call.resolve(JSObject().put("progress", pct), false) // keepAlive
                    }
                    if (state == Transformer.PROGRESS_STATE_COMPLETED || state == Transformer.PROGRESS_STATE_ERRORED) {
                        progressTimer?.cancel()
                        progressTimer = null
                    }
                }
            }
        }, 0, 500)
    }

    private fun handleSuccess(call: PluginCall, outFile: File) {
        progressTimer?.cancel()
        progressTimer = null
        currentTransformer = null
        try {
            val bytes = outFile.readBytes()
            val b64 = android.util.Base64.encodeToString(bytes, android.util.Base64.DEFAULT)
            val ret = JSObject()
                .put("base64", b64)
                .put("size", bytes.size)
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("read output failed", e)
        }
    }

    private fun handleError(call: PluginCall, e: Exception) {
        progressTimer?.cancel()
        progressTimer = null
        currentTransformer = null
        Log.e("Media3Transcode", "export error", e)
        // Try fallback to H.264 if HEVC/AV1 failed
        // The caller (native-transcode.ts) handles retry logic at the JS level.
        call.reject("export failed: ${e.message}")
    }
}