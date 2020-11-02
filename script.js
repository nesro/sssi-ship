/* hra se spustí při false po načtení normálně */
var notComplete = false; //true;
var showNotComplete = true; //false;

/* global variables ***********************************************************/
var canvas;
var context;
var width = 1024;//640; //[px]
var height = 600;//480; //[px]

var sounds; //object Sounds

var startGlobal = 0; //[ms]
var startTime = 0; //[ms]
var frameLength = 30; //[ms]
var currentFrame = 0;
var lastTime = 0; //[ms]
var timeDifference = 0; //[ms]
var gameFrame = 0;
var moveSteps = 0; //poměr animačního a herního framu vůči skutečnému vykreslování

var paused = false;
var gameOn = false;
var gameOver = false; //true, pokud je hráč mrtev
var gameWin = false; //true, pokud hráč vyhraje level

var drawAbout = false;
var drawLicense = false;

var fps;

var imagesLoad = 0; //kolik se nahrálo obrázků
var images = {
	"logo": new Image()
};

var currentLevel = 0; //číslo levelu
var nextLevelEvent = 0; //frame dalšího levelu
var eventTime = 0; //čas mezi předchozí a další událostí
var levelLength = 0; //počet eventů ve frame

var menuOn = false;
var menuActiveItem = 0;
var menuLength = 3;
var menuGo = false;
var menuItems = {
	"Nová hra": function() {
		menuOn = false;
		//startGame();

		gameOn = true;

	    loadLevel(0);

	   	/* add player */
		addSprite(protoPlayer);
		player.sprite = last();
		player.sprite.setHealth(20);
		player.sprite.x = width/2 - player.sprite.prototype.width;
		player.sprite.y = height - player.sprite.prototype.height - 2;
		player.sprite.ai.shotFreq = 200;
	},
	"O hře": function() {
		drawAbout = true;
		menuOn = false;
	},
	"Licence": function() {
		drawLicense = true;
		menuOn = false;
	},
	"Konec": function() {
		window.close();
	}
};

var sprites = new Array(); //Sprite object
var lastId = 0;

var player = {
	sprite: 0, //Sprite object
	speed: 17,
	blowback: 0,
	maxGenerator: 100,
	generator: 100,
	generatorSpeed: 4,
	up: false,
	down: false,
	left: false,
	right: false,
	shooting: false,
	shotRocket: false
};

var gradientBar; //gradient

var protoPlayer; //protoype
var protoSmallStar;
var protoBigStar;
var protoPlayerShotLaser;
var protoWarCircle;
var protoEnemyShot;
var protoRocket;
var protoBattleStar;
var protoExplosion;

var debug = true;
var soundsOn = true; //sound settings here
var showStars = true;

var loadedSprites = false;
var loadedSounds = 0;

var lastLaserSound = 1; //při laserování se střídají zvuky, zde je poslední
var laserSounds = 4;

/* sounds *********************************************************************/

function Sounds() {
	this.list = [
		"LaserShot1",	//http://www.freesound.org/samplesViewSingle.php?id=39459
		"LaserShot2",	//http://www.freesound.org/samplesViewSingle.php?id=39459
		"LaserShot3",	//http://www.freesound.org/samplesViewSingle.php?id=39459
		"Ding",				//http://www.freesound.org/samplesViewSingle.php?id=5212
		"Rocket",			//http://www.freesound.org/samplesViewSingle.php?id=47252
		"Leviathan",	//http://ccmixter.org/files/Fireproof_Babies/11528
	];

	this.sounds = new Array();
}

Sounds.prototype.createAudio = function( filename ) {
	var path = "./sounds/";

	var types = {
		".ogg": "audio/ogg",
		".mp3": "audio/mpeg"
	};

	var sources = "";
	for ( var i in types ) {
		sources += "<source src=\""+ path + filename + i +"\" type=\""+ types[i] +"\"></source>";
	}

	$("<audio id=\""+ filename +"\" preload=\"auto\">"+ sources +"</audio>").insertAfter("#audioelements");

	return $("#"+ filename).get(0);
}

Sounds.prototype.init = function() {
	for (i in this.list) {
		this.sounds[this.list[i]] = this.createAudio( this.list[i] );
	}
}

Sounds.prototype.loaded = function() {
    var loaded = 0;

    for (i in this.list) {
		if ( this.sounds[this.list[i]] && this.sounds[this.list[i]].buffered != undefined && this.sounds[this.list[i]].buffered.length != 0 ) {
            loaded += this.sounds[this.list[i]].buffered.end(0) / this.sounds[this.list[i]].duration;
        }
	}

	if ( loaded == 0 ) {
	    return 0;
	} else {
	    return parseInt(this.list.length / loaded) * 100;
	}
}

Sounds.prototype.play = function( sound ) {
	this.sounds[sound].pause();
	this.sounds[sound].currentTime = 0;

	setTimeout(function(){
		sounds.sounds[sound].play();
	}, 50);
}

Sounds.prototype.playMusic = function()
{
	$(this.sounds["Leviathan"]).bind("ended", function() {
		this.currentTime = 0;
		this.play();
	});

    this.sounds["Leviathan"].play();
}

/* sprites ********************************************************************/

function Sprite(id, prototype)
{
	this.id = id;
	this.prototype = prototype;

	this.x = 0;
	this.y = 0;

	this.dx = 0;
	this.dy = 0;

	this.startFrame = 0;
	this.currentFrame = 0;
	this.drawFrame = 0;

	this.createFrame = currentFrame;

	this.maxHealth = 0;
	this.health = 0;

	this.ai = {
		"flight": 0,
		"stopOnY": 0,
		"attack": 0,
		"shotFreq": 0,
		"lastShot": 0,
		"shootingDelay": 0,
		"shotSpeed": 0,
		"onDie": 0,
	};
}

Sprite.prototype.setHealth = function( health )
{
	this.maxHealth = health;
	this.health = health;
}

Sprite.prototype.getShot = function( damage )
{
	this.health -= damage;
	if ( this.health < 0 ) {
		if ( this.ai.onDie != 0 ) {
			this.ai.onDie();
		}

		addSprite(protoExplosion);
		last().x = this.x + this.prototype.width/2 - last().prototype.width/2;
		last().y = this.y + this.prototype.height/2 - last().prototype.width/2;

		delete sprites[this.id];
		return true;
	}
}

Sprite.prototype.draw = function()
{
	if (this.prototype == 0) {
		return;
	}

	if (this.prototype.frames > 0) {
		context.drawImage(
			this.prototype.frameArray[this.drawFrame],
			Math.round(this.x),
			Math.round(this.y)
		);
	} else {
		context.drawImage(
			this.prototype.frame,
			Math.round(this.x),
			Math.round(this.y)
		);
	}
}

/* prototypes *****************************************************************/

function SpritePrototype(frames, width, height, type)
{
	this.frames = frames;
	this.type = type;

	this.height = height;
	this.width = width;

	if (this.frames > 0) {
		this.frameArray = new Array(this.frames);
		for (var i = 0; i < this.frames; i++) {
			this.frameArray[i] = document.createElement("canvas");
			this.frameArray[i].width = width;
			this.frameArray[i].height = height;
		}
	} else {
		this.frame = document.createElement("canvas");
		this.frame.width = width;
		this.frame.height = height;
	}

	this.currentFrame = 0;

}

function createPrototypes()
{
	var tempCtx;
	var i;

	protoPlayer = new SpritePrototype(20, 20, 30, "player");
	for (i = 0; i < protoPlayer.frames; i++) {
		tempCtx = protoPlayer.frameArray[i].getContext("2d");

		tempCtx.strokeStyle = "#FFFFFF";
		tempCtx.lineWidth = 2.25;
		tempCtx.lineCup = "round";
		tempCtx.beginPath();
			tempCtx.moveTo(10, 0);
			tempCtx.lineTo(0, 30);
			tempCtx.lineTo(10, 20);
			tempCtx.lineTo(20, 30);
			tempCtx.lineTo(10, 0);
		tempCtx.stroke();

		tempCtx.beginPath();
			tempCtx.strokeStyle = "rgb("+i*12+", 0, 0)";
			tempCtx.arc(10, 14, 3, 0, Math.PI*2, true);
		tempCtx.stroke();
	}

	protoSmallStar = new SpritePrototype(0, 1, 1, "smallStar");
	tempCtx = protoSmallStar.frame.getContext("2d");
	tempCtx.fillStyle = "#FFFFFF";
	tempCtx.fillRect(0, 0, 1, 1);

	/*
		animace exploze
	*/
	protoExplosion = new SpritePrototype(50, 200, 200, "explosion");
	for (i = 0; i < protoExplosion.frames; i++) {
		tempCtx = protoExplosion.frameArray[i].getContext("2d");
		for ( var j = 0; j <= Math.PI*2; j += Math.PI/4 ) {
			tempCtx.fillStyle = "rgba("+ (255-(i*2)) +", "+ (100-i) +", 0, 0.8)";
			tempCtx.fillRect( 100 + Math.cos(j)*i*3 , 100 + Math.sin(j)*i*3, 4 - i/20, 4 - i/20);
		}
	}

	protoBattleStar = new SpritePrototype(359*8, 36, 36, "battleStar");
	for (i = 0; i < protoBattleStar.frames; i++) {
		tempCtx = protoBattleStar.frameArray[i].getContext("2d");
		tempCtx.beginPath();
		tempCtx.strokeStyle = "white";
		for ( var j = 0; j <= 4 * Math.PI; j += ( 4 * Math.PI ) / 5 ) {
			tempCtx.lineTo( 18 + 18 * Math.cos(j + i/8), 18 + 18 * Math.sin(j + i/8));
		}
		tempCtx.stroke();
	}

	protoBigStar = new SpritePrototype(0, 2, 2, "bigStar");
	tempCtx = protoBigStar.frame.getContext("2d");
	tempCtx.fillStyle = "#FFFFFF";
	tempCtx.fillRect(0, 0, 2, 2);

	protoEnemyShot = new SpritePrototype(18, 20, 20, "enemyShot");
	for (i = 0; i < protoEnemyShot.frames; i++) {
		tempCtx = protoEnemyShot.frameArray[i].getContext("2d");
		tempCtx.strokeStyle = "rgb(255,"+i*10+","+i*10+")";

		tempCtx.save();

		tempCtx.translate(10, 10);
		tempCtx.rotate( i * 20 * Math.PI / 180);

		var tempGrad = tempCtx.createLinearGradient(-5, -5, 5, 5);
		tempGrad.addColorStop(0, "yellow");
		tempGrad.addColorStop(0.25, "red");
		tempGrad.addColorStop(0.5, "black");
		tempGrad.addColorStop(0.75, "red");
		tempGrad.addColorStop(1, "yellow");
		tempCtx.fillStyle = tempGrad;

		tempCtx.fillRect(-5,-5,10,10);

		tempCtx.restore();
	}

	protoPlayerShotLaser = new SpritePrototype(10, 10, 60, "playerShotLaser");
	for (i = 0; i < protoPlayerShotLaser.frames; i++) {
		tempCtx = protoPlayerShotLaser.frameArray[i].getContext("2d");
		tempCtx.lineWidth = 0.5 + (i * 0.1);
		tempCtx.strokeStyle = "#00CCFF";
		tempCtx.beginPath();
			tempCtx.moveTo(0+i, 0);
			tempCtx.lineTo(10-i, 10);
			tempCtx.lineTo(0+i, 20);
			tempCtx.lineTo(10-i, 30);
			tempCtx.lineTo(0+i, 40);
			tempCtx.lineTo(10-i, 50);
			tempCtx.lineTo(0+i, 60);
		tempCtx.stroke();
	}

	protoRocket = new SpritePrototype(25, 50, 100, "rocket");
	for (i = 0; i < protoRocket.frames; i++) {
		tempCtx = protoRocket.frameArray[i].getContext("2d");
		tempCtx.strokeStyle = "white";
		tempCtx.beginPath();
			tempCtx.moveTo(25, 0);
			tempCtx.lineTo(30, 12);
			tempCtx.lineTo(25, 8);
			tempCtx.lineTo(20, 12);
			tempCtx.lineTo(25, 0);
		tempCtx.stroke();

		for (var j = 100; j > 0; j--) {
			tempCtx.fillStyle = "rgb("+ (255-j) +", "+ (255-j*2) +", 0)";
			tempCtx.fillRect(25-(j/4)+2*Math.random()*(j/4), 13+j, 1, 1);
		}
	}

	protoWarCircle = new SpritePrototype(50, 50, 50, "warCircle");
	for (i = 0; i < protoWarCircle.frames; i++) {
		tempCtx = protoWarCircle.frameArray[i].getContext("2d");

		tempCtx.beginPath();
			tempCtx.lineWidth = 2.25;
			if (i < 25) {
				tempCtx.strokeStyle = "rgb("+i*5+","+i*5+","+i*5+")";
			} else {
				tempCtx.strokeStyle = "rgb("+(50-i)*5+","+(50-i)*5+","+(50-i)*5+")";
			}
			tempCtx.arc(25, 25, 24, Math.PI*(i*0.04), Math.PI*(i*0.04)+Math.PI, true);
		tempCtx.stroke();
		tempCtx.beginPath();
			tempCtx.lineWidth = 2.25;
			if (i > 25) {
				tempCtx.strokeStyle = "rgb("+i*5+","+i*5+","+i*5+")";
			} else {
				tempCtx.strokeStyle = "rgb("+(50-i)*5+","+(50-i)*5+","+(50-i)*5+")";
			}
			tempCtx.arc(25, 25, 19, Math.PI*((25-i)*0.04), Math.PI*((25-i)*0.04)+(Math.PI*0.5), true);
		tempCtx.stroke();
		tempCtx.beginPath();
			tempCtx.lineWidth = 2.25;
			if (i < 25) {
				tempCtx.strokeStyle = "rgb("+i*5+","+i*5+","+i*5+")";
			} else {
				tempCtx.strokeStyle = "rgb("+(50-i)*5+","+(50-i)*5+","+(50-i)*5+")";
			}
			tempCtx.arc(25, 25, 14, Math.PI*(i*0.04), Math.PI*(i*0.04)+(Math.PI*1.5), true);
		tempCtx.stroke();
		tempCtx.beginPath();
			tempCtx.lineWidth = 2.25;
			if (i > 25) {
				tempCtx.strokeStyle = "rgb("+i*5+", 0, 0)";
			} else {
				tempCtx.strokeStyle = "rgb("+(50-i)*5+", 0, 0)";
			}
			tempCtx.arc(25, 25, 9, Math.PI*((25-i)*0.04), Math.PI*((25-i)*0.04)+(Math.PI*1.5), true);
		tempCtx.stroke();
		tempCtx.beginPath();
			tempCtx.lineWidth = 2.25;
			if (i < 25) {
				tempCtx.strokeStyle = "rgb("+i*5+","+i*5+","+i*5+")";
			} else {
				tempCtx.strokeStyle = "rgb("+(50-i)*5+","+(50-i)*5+","+(50-i)*5+")";
			}
			tempCtx.arc(25, 25, 4, Math.PI*(i*0.04), Math.PI*(i*0.04)+(Math.PI*1.5), true);
		tempCtx.stroke();
	}

	gradientBar = context.createLinearGradient(width - 120, height - 40, width - 20, height - 10);
	gradientBar.addColorStop(0, "rgba(50,255,50,0.8)");
	gradientBar.addColorStop(0.5, "rgba(255,255,50,0.8)");
	gradientBar.addColorStop(1, "rgba(255,50,50,0.8)");

	if (showStars) {
		generateStars(20);
	}

	loadedSprites = true;
}

/* game ***********************************************************************/

// detekce kolizí, a,b jsou sprite
function colision( a, b ) {
	if ( !a || !b ) {
		return false;
	}

	return (
		(
			( a.x < b.x + b.prototype.width ) &&
			( a.x > b.x ) &&
			( a.y < b.y + b.prototype.height ) &&
			( a.y > b.y )
		) || (
			( a.x + a.prototype.height < b.x + b.prototype.width ) &&
			( a.x + a.prototype.height > b.x ) &&
			( a.y + a.prototype.height < b.y + b.prototype.height ) &&
			( a.y + a.prototype.height > b.y )
		) || (
			( a.x + a.prototype.width < b.x + b.prototype.width ) &&
			( a.x + a.prototype.width > b.x ) &&
			( a.y + a.prototype.width < b.y + b.prototype.height ) &&
			( a.y + a.prototype.width > b.y )
		) || (
			( a.x + a.prototype.width + a.prototype.height < b.x + b.prototype.width ) &&
			( a.x + a.prototype.width + a.prototype.height > b.x ) &&
			( a.y + a.prototype.width + a.prototype.height < b.y + b.prototype.height ) &&
			( a.y + a.prototype.width + a.prototype.height > b.y )
		)
	);
}

function addSprite(prototype)
{
	for (var i = 0;; i++) {
		if (sprites[i] == null) {
			break;
		}
	}

	lastId = i;

	sprites[i] = new Sprite(i, prototype);
}

function last()
{
	return sprites[lastId];
}

function generateStars(amount)
{
	for (var i = 0; i < amount; i++) {
		if (Math.random() > 0.5) {
			addSprite(protoSmallStar);
		} else {
			addSprite(protoBigStar);
		}

		last().x = Math.round(Math.random() * width);
		last().dy = 1 + Math.random() * 10;
	}
}

/* levels *********************************************************************/
var level = new Array();
var symbols = new Array();

symbols["s"] = function(position) {
	addSprite(protoBattleStar);
	last().x = position;
	last().dy = 2;
	last().setHealth(1);
	last().createTime = startTime;
	last().ai.attack = "onPlayer";
	last().ai.shotFreq = 40;
	last().ai.shootingDelay = Math.random() * 50;
	last().ai.shootSpeed = 2;
}

symbols["C"] = function(position) {
	addSprite(protoWarCircle);
	last().x = position;
	last().dy = 1;
	last().setHealth(5);
	last().createTime = startTime;
	last().ai.flight = "static";
	last().ai.stopOnY = 50;
	last().ai.attack = "onPlayer";
	last().ai.shotFreq = 30;
	last().ai.shootingDelay = 350 + ( Math.random() * 50 );
	last().ai.shootSpeed = 7;
}

symbols["B"] = function(position) {
	addSprite(protoBattleStar);
	last().x = position;
	last().dy = 1;
	last().setHealth(20);
	last().createTime = startTime;
	last().ai.flight = "static";
	last().ai.stopOnY = 50;
	last().ai.attack = "onPlayer";
	last().ai.shotFreq = 5;
	last().ai.shootingDelay = 0;
	last().ai.shootSpeed = 4;
	last().ai.onDie = function() {
		setTimeout(function() {
			gameWin = true;
		}, 1500);
	};
}

level[0] = [
{d:  50, a:"00000s0000000000000000000000000000000000"},
{d:  80, a:"00000000000s0000000000000000000000000000"},
{d:  80, a:"00000000000000000s000s000000000000000000"},
{d:  80, a:"0000000000000000000000000000s00000000000"},
{d:  80, a:"0000000000000000000000000000000000s00000"},
{d: 100, a:"00000000000000000C0000000000000000000000"},
{d: 150, a:"00000000000s00000000000s0000000000000000"},
{d: 175, a:"00000000000s00000B00000s0000000000000000"},
];

function loadLevel(i)
{
	nextLevelEvent = 0;
	currentLevel = level[i];
	eventTime = 0;
	levelLength = currentLevel.length;
}

function levelEvents() {
	if ( eventTime != -1 && (eventTime + (currentLevel[nextLevelEvent]).d) < gameFrame) {
		for ( var i = 0; i < 40; i++ ) {
			if ( currentLevel[nextLevelEvent].a[i] != "0" ) {
				symbols[currentLevel[nextLevelEvent].a[i]](width/40*i);
			}
		}

		if ( nextLevelEvent + 1 < levelLength ) {
			nextLevelEvent++;
			eventTime += (currentLevel[nextLevelEvent]).d;
		} else {
			eventTime = -1;
		}
	}
}

function addBoss() {
	addSprite(protoBattleStar);
	last().x = width/2 - last().prototype.width/2;
	last().dy = 1;
	last().setHealth(20);
	last().createTime = startTime;
	last().ai.flight = "static";
	last().ai.stopOnY = 50;
	last().ai.attack = "onPlayer";
	last().ai.shotFreq = 5;
	last().ai.shootingDelay = 0;
	last().ai.shootSpeed = 4;
	last().ai.onDie = function() {
		setTimeout(function() {
			gameWin = true;
		}, 1500);
	};
}

function addBattleStar(x)
{
	addSprite(protoBattleStar);
	last().x = x;
	last().dy = 2;
	last().setHealth(1);
	last().createTime = startTime;
	last().ai.attack = "onPlayer";
	last().ai.shotFreq = 40;
	last().ai.shootingDelay = Math.random() * 50;
	last().ai.shootSpeed = 2;
}

function addWarCircleStatic(x, y)
{
	addSprite(protoWarCircle);
	last().x = x;
	last().dy = 1;
	last().setHealth(5);
	last().createTime = startTime;
	last().ai.flight = "static";
	last().ai.stopOnY = y;
	last().ai.attack = "onPlayer";
	last().ai.shotFreq = 40;
	last().ai.shootingDelay = 350 + ( Math.random() * 50 );
	last().ai.shootSpeed = 7;
}

/* handleSprites **************************************************************/
function handleSprites()
{
	for ( i in sprites ) {
			var tempSprite = sprites[i];

			if (tempSprite.prototype.frames > 0) { //animated frames
				tempSprite.drawFrame = ( currentFrame - tempSprite.createFrame ) % tempSprite.prototype.frames;
			}

			if (tempSprite.ai.flight == "static") {
				if (tempSprite.y <= tempSprite.ai.stopOnY) {
					tempSprite.y += tempSprite.dy * moveSteps;
				}
			} else {
				tempSprite.x += tempSprite.dx * moveSteps;
				tempSprite.y += tempSprite.dy * moveSteps;
			}

			switch (tempSprite.prototype.type) {
			case "player":
				if (player.blowback > 0) {
					player.sprite.y += player.blowback;

					player.blowback -= 0.25;

					if (player.sprite.y + player.sprite.prototype.height > height) {
						player.sprite.y = height - player.sprite.prototype.height;
					}
				}

				if (player.up && tempSprite.y > 0) {
					tempSprite.y -= player.speed * moveSteps;
				} else if (player.down && tempSprite.y < height - tempSprite.prototype.height) {
					tempSprite.y += player.speed * moveSteps;
				}
				if (player.right && tempSprite.x < width - tempSprite.prototype.width) {
					tempSprite.x += player.speed * moveSteps;
				} else if (player.left && tempSprite.x > 0) {
					tempSprite.x -= player.speed * moveSteps;
				}

				/* ROCKET */
				if (player.shotRocket && player.generator > 90) {
					player.generator = 0;
					player.shotRocket = false;

					if (soundsOn) {
						sounds.play("Rocket");
					}

					player.blowback += 7;

					addSprite(protoRocket);
					last().x = player.sprite.x - last().prototype.width;
					last().y = player.sprite.y - last().prototype.height;
					last().dy = -6;
				}

				if (player.shooting && (tempSprite.ai.lastShot + tempSprite.ai.shotFreq) < startTime && player.generator > 20) {
					player.generator -= 40;


					//TODO: multiple sounds
					if (soundsOn) {
						sounds.play("LaserShot"+ lastLaserSound);
						lastLaserSound++;
						if (lastLaserSound == laserSounds) {
							lastLaserSound = 1;
						}
					}

					player.blowback += 1.5;

					addSprite(protoPlayerShotLaser);
					last().x = player.sprite.x + last().prototype.width/2;
					last().y = player.sprite.y - last().prototype.height;
					last().dy = -6;

					tempSprite.ai.lastShot = startTime;
				}
				break;
			case "smallStar":
			case "bigStar":
				if (tempSprite.y > height) {
					delete sprites[tempSprite.id];
					generateStars(1);
				}
				break;

			/*
				Animace explose, která se zobrazí když sprite dostane zásah a zemře.
			*/
			case "explosion":
///				console.log(tempSprite.drawFrame);
				if ( tempSprite.drawFrame >= tempSprite.prototype.frames - 5) {
					delete sprites[tempSprite.id];
				}
				break;

			case "playerShotLaser":
			case "rocket":
				if (tempSprite.y + tempSprite.prototype.height < 0) {
					delete sprites[tempSprite.id];
				}

				for (j in sprites) {
					if ( ( sprites[j].prototype.type == "warCircle" || sprites[j].prototype.type == "battleStar" ) && colision( tempSprite, sprites[j] ) ) {
						sprites[j].getShot(1);
						delete sprites[tempSprite.id];
					}
				}

				break;
			case "enemyShot":
				if (tempSprite.y > height || tempSprite.y < 0 || tempSprite.x > width || tempSprite.x < 0 ) {
					delete sprites[tempSprite.id];
				}

				if ( colision( tempSprite, player.sprite ) ) {
					delete sprites[tempSprite.id];
					player.sprite.health--;

					if ( player.sprite.health < 0 ) {
						gameOver = true;

						return;
					}
				}

				break;
			case "battleStar":
				if (tempSprite.y > height) {
					delete sprites[tempSprite.id];
				}
			case "warCircle":

				if ( tempSprite.ai.shotFreq && (tempSprite.ai.lastShot + tempSprite.ai.shotFreq) < currentFrame && (tempSprite.createFrame + tempSprite.ai.shootingDelay) < currentFrame ) {

					var sx = tempSprite.x + tempSprite.prototype.width/2;
					var sy = tempSprite.y + tempSprite.prototype.height/2;

					addSprite(protoEnemyShot);
					last().x = sx;
					last().y = sy;

					var px = player.sprite.x - 15 + Math.random()*30 + player.sprite.prototype.width/2;
					var py = player.sprite.y - 15 + Math.random()*30 + player.sprite.prototype.height/2;

					var vx = px - sx;
					var vy = py - sy;

					var distance = Math.sqrt((vx * vx) + (vy * vy));

					last().dx = (vx * tempSprite.ai.shootSpeed) / distance;
					last().dy = (vy * tempSprite.ai.shootSpeed) / distance;

					tempSprite.ai.lastShot = currentFrame;
				}
				break;
			default:
				break;
			}

			tempSprite.draw();
	}
}

/* loop ***********************************************************************/

function loop()
{
	startTime = jQuery.now();

	if (lastTime == 0) {
		lastTime = startTime + 1;
	}

	currentFrame = Math.floor((startTime - startGlobal) / frameLength);

	//o kolik framů jsme rychleší
	moveSteps = timeDifference / frameLength;

	if (paused) {
		context.font = "bold 42px Ubuntu";
		context.fillStyle = "rgba(255, 55, 55, 0.1)";
		context.fillText("Pauza", (width/2)-100, (height/2));
	} else if ( gameOver ) {
		context.font = "bold 42px Ubuntu";
		context.fillStyle = "rgba(255, 255, 255, 0.1)";
		context.fillText("Prohráls!", (width/2)-130, (height/2));
	} else if ( gameWin ) {
		context.font = "bold 42px Ubuntu";
		context.fillStyle = "rgba(255, 255, 255, 0.1)";
		context.fillText("Vyhráls!", (width/2)-110, (height/2));
	} else {

		context.fillStyle = "rgba(0, 0, 0, 0.6)";
		context.fillRect(0, 0, width, height);

		if (gameOn) {
			gameFrame += moveSteps;
			levelEvents();
		}

        if ( !gameOn && !menuOn && !drawAbout && !drawLicense ) {

		    loadedSounds = sounds.loaded();

		    if ( loadedSounds == 100 ) {
		        setTimeout(function() {
		            if (soundsOn) {
		                sounds.playMusic();
	                }

	                if ( notComplete ) {
	                    showNotComplete = true;
			        } else if ( !gameOn ) {
   	                	menuOn = true;
    	            }
	            }, 750);
			}

            if ( notComplete && showNotComplete ) {

                context.fillStyle = "rgba("+ Math.abs(255-(currentFrame%(255*2))) +", "+ (255-Math.abs(255-(currentFrame%(255*2)))) +", "+ (255-Math.abs(255-(currentFrame%(255*2)))) +", 0.8)";
                context.font = "bold 12px monospace";
	            context.fillText("Tato aplikace je součástí maturitní práce Tomáše Nesrovnala.", 50, 300);
	            context.fillText("Ukazuje řešení popsané v práci,  ", 50, 325);
	            context.fillText("tedy poletující sprity, zvuk a stisk kláves (P pro pauzu). ", 100, 350);
	            context.fillText("Spuštění celé aplikace bude součástí prezentace.", 50, 375);
	            context.fillText("Zdrojový kód, včetně herní logiky je součástí toho dokumentu (CTRL + U).", 50, 400);
	        } else {
    			context.fillStyle = "white";
	    		context.fillText("Načteno: "+ loadedSounds +"%", 250, 250);
	        }

        }

		handleSprites();

		if (gameOn && player.generator < player.maxGenerator) {
			player.generator += player.generatorSpeed * ((player.generator + 25) / 100) * moveSteps;
		}

	}

	if (gameOn && !gameOver) {
		/* info bars */
		context.fillStyle = gradientBar;

		var generatorLength = (100 / player.maxGenerator) * player.generator;
		if (generatorLength > 0) {
			context.fillRect(width - 120 + (100 - generatorLength), height - 20, generatorLength, 10);
		}

		var livesLength = (100 / player.sprite.maxHealth) * player.sprite.health;
		if (livesLength > 0) {
			context.fillRect(width - 120 + (100 - livesLength), height - 40, livesLength, 10);
		}

		/* rocket status */
		if (player.shotRocket) {
			context.fillStyle = "rgba(255, 0, 0, 0.5)";
			context.fillRect(width - 120, height - 20, 2, 10);
		}

	}

	if (menuOn) {
		drawMenu();
	} else if ( drawAbout ) {
		context.fillStyle = "rgba("+ Math.abs(255-(currentFrame%(255*2))) +", "+ (255-Math.abs(255-(currentFrame%(255*2)))) +", "+ (255-Math.abs(255-(currentFrame%(255*2)))) +", 0.8)";
        context.font = "bold 12px monospace";
	    context.fillText("Tato aplikace je součástí maturitní práce Tomáše Nesrovnala.", 50, 100);
	    context.fillText("Ukazuje řešení popsané v práci,  ", 50, 125);
	    context.fillText("tedy poletující sprity, zvuk a stisk kláves. ", 100, 150);
        context.fillText("Zdrojový kód, včetně herní logiky je součástí toho dokumentu (CTRL + U).", 50, 175);
	} else if ( drawLicense ) {
		context.fillStyle = "rgba("+ Math.abs(255-(currentFrame%(255*2))) +", "+ (255-Math.abs(255-(currentFrame%(255*2)))) +", "+ (255-Math.abs(255-(currentFrame%(255*2)))) +", 0.8)";
        context.font = "bold 12px monospace";
	    context.fillText('Aplikace je pod: http://creativecommons.org/licenses/by/3.0/cz', 50, 100);
	    context.fillText("Zvuky:  ", 50, 125);
	    context.fillText('LaserShot: http://www.freesound.org/samplesViewSingle.php?id=39459', 100, 150);
	    context.fillText('Ding: http://www.freesound.org/samplesViewSingle.php?id=5212', 100, 175);
	    context.fillText('Rocket: http://www.freesound.org/samplesViewSingle.php?id=47252', 100, 200);
	    context.fillText('Leviathan: http://ccmixter.org/files/Fireproof_Babies/11528', 100, 225);
	}

	if (timeDifference == 0) {
		timeDifference = 0.1;
	}

	timeDifference = startTime - lastTime;

	if (debug) { //FIXME: if needed
		 if ( currentFrame % 4 == 0 ) {
		 	fps = Math.round(1000/timeDifference);
		 }
//		$("#fps").text("fps: " + fps + " frme: "+ currentFrame);
		context.font = "bold 12px monospace";
		context.fillStyle = "white";
    context.fillText("fps: "+fps, 10, height-20);

	}


	lastTime = startTime;

	setTimeout(loop, 20);
}


$(document).keydown(function(event)
{
	if ( drawAbout || drawLicense ) {
		drawAbout = false;
		drawLicense = false;
		menuOn = true;
	} else if ( (gameOver || gameWin) &&  event.keyCode == 13 ) {
		delete player.sprite;
		sprites = new Array();

		if (showStars) {
			generateStars(20);
		}

		gameFrame = 0;
		menuOn = true;
		gameOn = false;
		gameOver = false;
		gameWin = false;
	} else {

	switch (event.keyCode) {
	case 32:
		if ( player.generator > 20 ) {
			player.shooting = true;
		}
		break;
	case 38:
		player.up = true;
		player.down = false;

		if (menuOn) {
			menuActiveItem--;
		}
		break;
	case 40:
		player.down = true;
		player.up = false;

		if (menuOn) {
			menuActiveItem++;
		}
		break;
	case 37:
		player.left = true;
		player.right = false;
		break;
	case 39:
		player.right = true;
		player.left = false;
		break;
	case 80: //P
		paused = !paused;
		break;
	case 82: //R
		player.shotRocket = !player.shotRocket;
		break;
	case 83: //S
		startGame();
		break;
	case 13: //enter
		menuGo = true;
		break;
	case 27: //escape
	case 81: //Q
		menuOn = true;
		gameOn = false;
		delete sprites[player.sprite.id];
		break;
	default:
//	alert(event.keyCode);
		break;
	}
	}
});

$(document).keyup(function(event)
{
	switch (event.keyCode) {
	case 32:
		player.shooting = false;
		break;
	case 38:
		player.up = false;
		break;
	case 40:
		player.down = false;
		break;
	case 37:
		player.left = false;
		break;
	case 39:
		player.right = false;
		break;
	default:
		break;
	}
});

function drawMenu()
{
	if (menuActiveItem > menuLength) {
		menuActiveItem = 0;
	} else if (menuActiveItem < 0) {
		menuActiveItem =menuLength;
	}

	context.drawImage(images["logo"], 66, 120);

	context.font = "bold 76px Ubuntu";

	context.save();
	context.shadowOffsetX = 6 - Math.random()*12;
        context.shadowOffsetY = 6 - Math.random()*12;
        context.shadowBlur = 5;
        context.shadowColor = "rgba(255, 255, 255, 0.7)";
	context.fillStyle = "black";
	context.fillText("SSSI Ship", 66, 66);
	context.restore();

	context.font = "bold 42px Ubuntu";

	var j = 0;
	for (var i in menuItems) {
		if (menuActiveItem == j) {
			context.save();
			context.shadowOffsetX = 3 - Math.random()*6;
	        context.shadowOffsetY = 3 - Math.random()*6;
	        context.shadowBlur = 3;
	        context.shadowColor = "white";
			context.fillStyle = "rgba(0, 0, 0, 0.5)";

			if (menuGo) {
				context.fillStyle = "rgba(255, 255, 255, 0.8)";
				context.fillRect(0, 0, width, height);

				menuGo = false;

				context.restore();

				if (soundsOn) {
					sounds.play("Ding");
				}

				menuItems[i]();

				return;
			}
		} else {
			context.fillStyle = "rgba(255, 255, 255, 0.6)";
		}

		context.fillText(i, 250, 150 + j*50);
		context.restore();

		j++;
	}

	context.font = "10px monospace";
	context.fillText("SSSI Ship 0.1", 11, height - 11);

}


function load() {
	if (soundsOn) {
		sounds.init();
	}

	for (var i in images) {
		var file = "./images/"+ i +".png";

		images[i].src = file;

		// $(images[i]).load(function() {
		$(images[i]).on('load', function() {
			imagesLoad++;
		});
	}
}

$(window).on('load', function() {
	canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	canvas.setAttribute("style", "background: #000000; border: 1px solid #666666;");
	document.body.appendChild(canvas);
	context = canvas.getContext("2d");

	if ( soundsOn ) {
		sounds = new Sounds();
	}

	createPrototypes();
	load();

	startGlobal = jQuery.now();
	loop();

});

