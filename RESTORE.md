Auf Server
tar -xzf imagedisplayer-full.tar.gz -C ~/projects/
sudo cp nginx-imagedisplayer.conf /etc/nginx/sites-available/imagedisplayer
sudo cp imagedisplayer.service /etc/systemd/system/imagedisplayer.service

sudo systemctl daemon-reload
sudo systemctl restart nginx
sudo systemctl restart imagedisplayer