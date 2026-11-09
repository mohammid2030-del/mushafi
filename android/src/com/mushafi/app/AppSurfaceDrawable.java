package com.mushafi.app;

import android.content.Context;
import android.graphics.*;
import android.graphics.drawable.Drawable;
import android.util.Xml;
import androidx.core.graphics.PathParser;
import java.io.InputStream;
import java.util.ArrayList;
import org.xmlpull.v1.XmlPullParser;

/** One stationary app background across the safe content area and both transparent system bars. */
final class AppSurfaceDrawable extends Drawable {
 private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
 private final ArrayList<Path> paths=new ArrayList<>();
 private final float density;
 private boolean dark;
 private int shaderWidth=-1,shaderHeight=-1;
 private Shader topGlow,bottomGlow;
 AppSurfaceDrawable(Context context,boolean dark){
  density=context.getResources().getDisplayMetrics().density;this.dark=dark;
  try(InputStream input=context.getAssets().open("islamic-geometry.svg")){
   XmlPullParser parser=Xml.newPullParser();parser.setInput(input,"UTF-8");
   for(int event=parser.getEventType();event!=XmlPullParser.END_DOCUMENT;event=parser.next())
    if(event==XmlPullParser.START_TAG&&"path".equals(parser.getName())){
     String data=parser.getAttributeValue(null,"d");Path path=PathParser.createPathFromPathData(data);if(path!=null)paths.add(path);
    }
  }catch(Exception ignored){/* The solid background remains available even if the decorative asset cannot load. */}
 }
 void setDark(boolean value){if(dark!=value){dark=value;shaderWidth=-1;invalidateSelf();}}
 @Override public void draw(Canvas canvas){
  Rect bounds=getBounds();int width=bounds.width(),height=bounds.height();if(width<=0||height<=0)return;
  int save=canvas.save();canvas.translate(bounds.left,bounds.top);canvas.clipRect(0,0,width,height);
  paint.setStyle(Paint.Style.FILL);paint.setShader(null);paint.setColor(dark?NightPalette.BACKGROUND:0xfff5f3ed);canvas.drawRect(0,0,width,height,paint);
  if(shaderWidth!=width||shaderHeight!=height){
   shaderWidth=width;shaderHeight=height;
   topGlow=ellipse(0,0,width*.9f,height*.9f,dark?0x0bb59353:0x12b59353);
   bottomGlow=ellipse(width,height,width,height,dark?0x1a2d634a:0x0d4b785b);
  }
  paint.setColor(Color.WHITE);paint.setShader(topGlow);canvas.drawRect(0,0,width,height,paint);
  paint.setShader(bottomGlow);canvas.drawRect(0,0,width,height,paint);paint.setShader(null);
  boolean wide=width/density>=850;float tile=(wide?280:240)*density,offsetX=(wide?-110:-100)*density,offsetY=(wide?-80:-60)*density;
  paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(.85f);paint.setStrokeJoin(Paint.Join.ROUND);paint.setColor(dark?0x1cb59353:0x24b59353);
  for(float y=offsetY;y<height;y+=tile)for(float x=offsetX;x<width;x+=tile){int tileSave=canvas.save();canvas.translate(x,y);canvas.scale(tile/240f,tile/240f);for(Path path:paths)canvas.drawPath(path,paint);canvas.restoreToCount(tileSave);}
  canvas.restoreToCount(save);
 }
 private static Shader ellipse(float x,float y,float rx,float ry,int color){
  RadialGradient gradient=new RadialGradient(0,0,1,new int[]{color,Color.TRANSPARENT},new float[]{0,.65f},Shader.TileMode.CLAMP);Matrix matrix=new Matrix();matrix.setScale(Math.max(1,rx),Math.max(1,ry));matrix.postTranslate(x,y);gradient.setLocalMatrix(matrix);return gradient;
 }
 @Override public void setAlpha(int alpha){/* The app surface is intentionally opaque. */}
 @Override public void setColorFilter(ColorFilter filter){paint.setColorFilter(filter);invalidateSelf();}
 @Override public int getOpacity(){return PixelFormat.OPAQUE;}
}
