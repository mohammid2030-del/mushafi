package com.mushafi.app;
import android.content.Context;
import android.graphics.*;
import java.io.InputStream;
/** Offline media artwork. One bounded bitmap is cached for the current reciter. */
public final class ReciterArtwork {
 private int cachedReader=-1;private Bitmap cached;
 public static String asset(int reader){switch(reader){case 7:return "mishary-alafasy";case 133:return "maher-almuaiqly";case 6:return "mahmoud-alhusary";case 2:return "abdulbasit-abdulsamad";case 3:return "abdurrahman-as-sudais";case 1001:return "ali-alhudhaifi";case 1002:return "muhammad-ayyub";case 1003:return "khalid-almuhanna";case 1004:return "ibrahim-alakhdar";case 1005:return "ahmad-alnafees";default:return null;}}
 public synchronized Bitmap forReader(Context context,int reader){
  if(cachedReader==reader)return cached;cachedReader=reader;cached=null;String name=asset(reader);if(name==null)return null;
  try{
   String path="images/"+name+".png";BitmapFactory.Options options=new BitmapFactory.Options();options.inJustDecodeBounds=true;
   try(InputStream in=context.getAssets().open(path)){BitmapFactory.decodeStream(in,null,options);}
   options.inJustDecodeBounds=false;options.inSampleSize=1;while(Math.max(options.outWidth,options.outHeight)/options.inSampleSize>768)options.inSampleSize*=2;
   Bitmap portrait;try(InputStream in=context.getAssets().open(path)){portrait=BitmapFactory.decodeStream(in,null,options);}if(portrait==null)return null;
   int width=portrait.getWidth(),height=portrait.getHeight(),left=width,top=height,right=0,bottom=0;int[] pixels=new int[width*height];portrait.getPixels(pixels,0,width,0,0,width,height);
   for(int y=0;y<height;y++)for(int x=0;x<width;x++)if((pixels[y*width+x]>>>24)>16){left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);}
   if(right<=left||bottom<=top)return null;
   int side=Math.min(right-left,bottom-top),x=left+(right-left-side)/2;
   Bitmap art=Bitmap.createBitmap(384,384,Bitmap.Config.ARGB_8888);Canvas canvas=new Canvas(art);canvas.drawColor(NightPalette.SURFACE);
   Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG|Paint.FILTER_BITMAP_FLAG);canvas.drawBitmap(portrait,new Rect(x,top,x+side,top+side),new RectF(0,0,384,384),paint);
   cached=art;return art;
  }catch(Exception ignored){return null;}
 }
}
