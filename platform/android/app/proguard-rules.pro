# kotlinx.serialization keeps its generated serializers through its own consumer rules; the payload classes are
# looked up by those serializers only.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
# A widget's page calls WorldletAndroid.seed() and post() (ui/Widgets.kt) by name.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
